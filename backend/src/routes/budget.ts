import { Hono } from "hono";
import { isAuthenticated, type UserEnv } from "../services/auth.ts";
import type { DbEnv } from "../db/connection.ts";
import { HTTPException } from "hono/http-exception";
import { CategorySpendingQuerySchema, UpdateExpenseSchema } from "../types/budget.ts";
import { budgetCategoriesTable, expensesTable } from "../db/schema.ts";
import { eq, inArray, sql } from "drizzle-orm";
import { summariseCategorySpending } from "../services/category-spending.ts";

type Db = DbEnv["Variables"]["db"];

const budgetApp = new Hono<UserEnv & DbEnv>();
budgetApp.use("*", isAuthenticated);

function isExecOrAdmin(role: string): boolean {
    return role === "exec" || role === "admin";
}

// Execs and admins can manage any expense in their club; standard members only their own.
// Returns null (treated as 404) for expenses the user can't touch, so their existence isn't leaked.
async function loadManageableExpense(db: Db, expenseId: number, user: UserEnv["Variables"]["user"]) {
    const expense = await db.query.expensesTable.findFirst({
        where: { id: expenseId },
        with: { event: true }
    });

    if (!expense || !expense.event || expense.event.clubId !== user.club.id) return null;
    if (!isExecOrAdmin(user.role) && expense.createdBy !== user.id) return null;
    return expense;
}

budgetApp.get("/spending", async (c) => {
    const user = c.var.user;
    const db = c.get("db");
    if (!isExecOrAdmin(user.role)) throw new HTTPException(403);

    const events = await db.query.eventsTable.findMany({
        where: { clubId: user.club.id },
        orderBy: { start: "desc" }
    });
    const eventIds = events.map((event) => event.id);

    const allocationTotals = eventIds.length > 0
        ? await db
            .select({ eventId: budgetCategoriesTable.eventId, total: sql<string>`sum(${budgetCategoriesTable.allocatedAmount})` })
            .from(budgetCategoriesTable)
            .where(inArray(budgetCategoriesTable.eventId, eventIds))
            .groupBy(budgetCategoriesTable.eventId)
        : [];

    const expenseTotals = eventIds.length > 0
        ? await db
            .select({ eventId: expensesTable.eventId, total: sql<string>`sum(${expensesTable.amount})` })
            .from(expensesTable)
            .where(inArray(expensesTable.eventId, eventIds))
            .groupBy(expensesTable.eventId)
        : [];

    const allocatedByEvent = new Map(allocationTotals.map((row) => [row.eventId, Number(row.total)]));
    const spentByEvent = new Map(expenseTotals.map((row) => [row.eventId, Number(row.total)]));

    const spending = events
        .filter((event) => allocatedByEvent.has(event.id) || spentByEvent.has(event.id))
        .map((event) => ({
            eventId: event.id,
            name: event.name,
            start: event.start,
            archived: event.archived,
            totalAllocated: allocatedByEvent.get(event.id) ?? 0,
            totalSpent: spentByEvent.get(event.id) ?? 0
        }));

    return c.json(spending);
});

budgetApp.get("/categories", async (c) => {
    const user = c.var.user;
    const db = c.get("db");
    if (!isExecOrAdmin(user.role)) throw new HTTPException(403, { message: "Only club admins and execs can view category spending" });

    const parsed = CategorySpendingQuerySchema.safeParse(c.req.query());
    if (!parsed.success) throw new HTTPException(400, { message: "Invalid date range" });
    const { from, to } = parsed.data;

    const events = await db.query.eventsTable.findMany({
        where: {
            clubId: user.club.id,
            ...((from || to) && { start: { ...(from && { gte: from }), ...(to && { lte: to }) } })
        },
        orderBy: { start: "desc" }
    });
    const eventIds = events.map((event) => event.id);
    if (eventIds.length === 0) return c.json(summariseCategorySpending([], [], []));

    // Same name on different events is the same category club-wide.
    const categoryKey = sql<string>`lower(trim(${budgetCategoriesTable.name}))`;
    const categoryName = sql<string>`min(trim(${budgetCategoriesTable.name}))`;

    const allocationRows = await db
        .select({ key: categoryKey, name: categoryName, eventId: budgetCategoriesTable.eventId, total: sql<string>`sum(${budgetCategoriesTable.allocatedAmount})` })
        .from(budgetCategoriesTable)
        .where(inArray(budgetCategoriesTable.eventId, eventIds))
        .groupBy(categoryKey, budgetCategoriesTable.eventId);

    const spendRows = await db
        .select({ key: categoryKey, name: categoryName, eventId: expensesTable.eventId, total: sql<string>`sum(${expensesTable.amount})` })
        .from(expensesTable)
        .innerJoin(budgetCategoriesTable, eq(expensesTable.categoryId, budgetCategoriesTable.id))
        .where(inArray(expensesTable.eventId, eventIds))
        .groupBy(categoryKey, expensesTable.eventId);

    return c.json(summariseCategorySpending(events, allocationRows, spendRows));
});

budgetApp.put("/expenses/:id{[0-9]+}", async (c) => {
    const user = c.var.user;
    const db = c.get("db");

    const expenseId = Number(c.req.param("id"));
    const body = await c.req.json();
    const parsed = UpdateExpenseSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: "Invalid payload" });

    const existingExpense = await loadManageableExpense(db, expenseId, user);
    if (!existingExpense) throw new HTTPException(404, { message: "Expense not found" });

    const category = await db.query.budgetCategoriesTable.findFirst({
        where: { id: parsed.data.categoryId, eventId: existingExpense.eventId }
    });
    if (!category) throw new HTTPException(400, { message: "Category does not belong to this event" });

    const [expense] = await db
        .update(expensesTable)
        .set({
            categoryId: parsed.data.categoryId,
            amount: parsed.data.amount,
            description: parsed.data.description
        })
        .where(eq(expensesTable.id, expenseId))
        .returning();

    return c.json(expense);
});

budgetApp.delete("/expenses/:id{[0-9]+}", async (c) => {
    const user = c.var.user;
    const db = c.get("db");

    const expenseId = Number(c.req.param("id"));
    const existingExpense = await loadManageableExpense(db, expenseId, user);
    if (!existingExpense) throw new HTTPException(404, { message: "Expense not found" });

    await db.delete(expensesTable).where(eq(expensesTable.id, expenseId));

    return c.json({ message: "Deleted" });
});

export { budgetApp };
