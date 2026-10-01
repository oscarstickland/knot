import { Hono } from "hono";
import { isAuthenticated, type UserEnv } from "../services/auth.ts";
import type { DbEnv } from "../db/connection.ts";
import { HTTPException } from "hono/http-exception";
import { CreateCategorySchema, UpdateCategorySchema, UpdateExpenseSchema } from "../types/budget.ts";
import { budgetCategoriesTable, eventBudgetsTable, expensesTable } from "../db/schema.ts";
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

budgetApp.get("/categories", async (c) => {
    const user = c.var.user;
    const db = c.get("db");

    const categories = await db.query.budgetCategoriesTable.findMany({
        where: { clubId: user.club.id }
    });

    return c.json(categories);
});

budgetApp.post("/categories", async (c) => {
    const user = c.var.user;
    const db = c.get("db");
    if (user.role !== "admin") throw new HTTPException(403);

    const body = await c.req.json();
    const parsed = CreateCategorySchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: "Invalid payload" });

    const existing = await db.query.budgetCategoriesTable.findFirst({
        where: { clubId: user.club.id, name: parsed.data.name }
    });
    if (existing) throw new HTTPException(400, { message: "A category with this name already exists" });

    const [category] = await db
        .insert(budgetCategoriesTable)
        .values({ clubId: user.club.id, name: parsed.data.name })
        .returning();

    return c.json(category, 201);
});

budgetApp.put("/categories/:id{[0-9]+}", async (c) => {
    const user = c.var.user;
    const db = c.get("db");
    if (user.role !== "admin") throw new HTTPException(403);

    const categoryId = Number(c.req.param("id"));
    const body = await c.req.json();
    const parsed = UpdateCategorySchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: "Invalid payload" });

    const existingCategory = await db.query.budgetCategoriesTable.findFirst({
        where: { id: categoryId, clubId: user.club.id }
    });
    if (!existingCategory) throw new HTTPException(404, { message: "Category not found" });

    const duplicate = await db.query.budgetCategoriesTable.findFirst({
        where: { clubId: user.club.id, name: parsed.data.name, id: { ne: categoryId } }
    });
    if (duplicate) throw new HTTPException(400, { message: "A category with this name already exists" });

    const [category] = await db
        .update(budgetCategoriesTable)
        .set({ name: parsed.data.name })
        .where(eq(budgetCategoriesTable.id, categoryId))
        .returning();

    return c.json(category);
});

budgetApp.delete("/categories/:id{[0-9]+}", async (c) => {
    const user = c.var.user;
    const db = c.get("db");
    if (user.role !== "admin") throw new HTTPException(403);

    const categoryId = Number(c.req.param("id"));

    const existingCategory = await db.query.budgetCategoriesTable.findFirst({
        where: { id: categoryId, clubId: user.club.id }
    });
    if (!existingCategory) throw new HTTPException(404, { message: "Category not found" });

    const [allocation, expense] = await Promise.all([
        db.query.eventBudgetsTable.findFirst({ where: { categoryId } }),
        db.query.expensesTable.findFirst({ where: { categoryId } })
    ]);
    if (allocation || expense) {
        throw new HTTPException(409, {
            message: "This category is in use by an event budget or expense and cannot be deleted"
        });
    }

    await db.delete(budgetCategoriesTable).where(eq(budgetCategoriesTable.id, categoryId));

    return c.json({ message: "Deleted" });
});

budgetApp.get("/spending", async (c) => {
    const user = c.var.user;
    const db = c.get("db");
    if (!isExecOrAdmin(user.role)) throw new HTTPException(403);

    const categories = await db.query.budgetCategoriesTable.findMany({
        where: { clubId: user.club.id }
    });
    const categoryIds = categories.map((category) => category.id);

    const allocationTotals = categoryIds.length > 0
        ? await db
            .select({ categoryId: eventBudgetsTable.categoryId, total: sql<string>`sum(${eventBudgetsTable.allocatedAmount})` })
            .from(eventBudgetsTable)
            .where(inArray(eventBudgetsTable.categoryId, categoryIds))
            .groupBy(eventBudgetsTable.categoryId)
        : [];

    const expenseTotals = categoryIds.length > 0
        ? await db
            .select({ categoryId: expensesTable.categoryId, total: sql<string>`sum(${expensesTable.amount})` })
            .from(expensesTable)
            .where(inArray(expensesTable.categoryId, categoryIds))
            .groupBy(expensesTable.categoryId)
        : [];

    const allocatedByCategory = new Map(allocationTotals.map((row) => [row.categoryId, Number(row.total)]));
    const spentByCategory = new Map(expenseTotals.map((row) => [row.categoryId, Number(row.total)]));

    const spending = categories.map((category) => ({
        categoryId: category.id,
        name: category.name,
        totalAllocated: allocatedByCategory.get(category.id) ?? 0,
        totalSpent: spentByCategory.get(category.id) ?? 0
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
        where: { id: parsed.data.categoryId, clubId: user.club.id }
    });
    if (!category) throw new HTTPException(400, { message: "Category does not belong to this club" });

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
