import { Hono } from "hono";
import { isAuthenticated, type UserEnv } from "../services/auth.ts";
import type { DbEnv } from "../db/connection.ts";
import { HTTPException } from "hono/http-exception";
import { UpdateExpenseSchema } from "../types/budget.ts";
import { budgetCategoriesTable, expensesTable } from "../db/schema.ts";
import { eq, inArray, sql } from "drizzle-orm";

type Db = DbEnv["Variables"]["db"];

const budgetApp = new Hono<UserEnv & DbEnv>();
budgetApp.use("*", isAuthenticated);

function isExecOrAdmin(role: string): boolean {
    return role === "exec" || role === "admin";
}

async function loadClubExpense(db: Db, expenseId: number, clubId: number) {
    const expense = await db.query.expensesTable.findFirst({
        where: { id: expenseId },
        with: { event: true }
    });

    if (!expense || !expense.event || expense.event.clubId !== clubId) return null;
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

budgetApp.put("/expenses/:id{[0-9]+}", async (c) => {
    const user = c.var.user;
    const db = c.get("db");
    if (!isExecOrAdmin(user.role)) throw new HTTPException(403);

    const expenseId = Number(c.req.param("id"));
    const body = await c.req.json();
    const parsed = UpdateExpenseSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: "Invalid payload" });

    const existingExpense = await loadClubExpense(db, expenseId, user.club.id);
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
    if (!isExecOrAdmin(user.role)) throw new HTTPException(403);

    const expenseId = Number(c.req.param("id"));
    const existingExpense = await loadClubExpense(db, expenseId, user.club.id);
    if (!existingExpense) throw new HTTPException(404, { message: "Expense not found" });

    await db.delete(expensesTable).where(eq(expensesTable.id, expenseId));

    return c.json({ message: "Deleted" });
});

export { budgetApp };
