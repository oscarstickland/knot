import {Hono} from "hono";
import {isAuthenticated, type UserEnv} from "../services/auth.ts";
import type {DbEnv} from "../db/connection.ts";
import {zValidator} from "@hono/zod-validator";
import { z } from 'zod';
import {HTTPException} from "hono/http-exception";
import {ArchiveEventSchema, type ClubEventWithTaskProgress, SetAttendanceOpenSchema, UpdateEventSchema} from "../types/events.ts";
import {
    CreateExpenseSchema,
    SetEventBudgetSchema,
    type EventBudgetSummary,
    type ExpenseWithRelations,
    type MemberBudgetView
} from "../types/budget.ts";
import {CreateEventDocumentSchema} from "../types/event-documents.ts";
import {clubsTable, eventsTable, budgetCategoriesTable, eventDocumentsTable, expensesTable, tasksTable} from "../db/schema.ts";
import {and, count, eq, inArray, sql} from "drizzle-orm";
import {describeZodError} from "../types/errors.ts";

function isExecOrAdmin(role: string): boolean {
    return role === "exec" || role === "admin";
}

type Db = DbEnv["Variables"]["db"];

const eventsApp = new Hono<UserEnv & DbEnv>();
eventsApp.use("*", isAuthenticated);

eventsApp.get("/", async (c) => {
    const user = c.var.user;
    const db = c.get('db');
    const isEventManager = user.role === "admin" || user.role === "exec";
    const archivedParam = c.req.query("archived");

    if (archivedParam !== "false" && !isEventManager) {
        throw new HTTPException(403, { message: "Only club admins and execs can view archived events" });
    }

    const events = await db.query.eventsTable.findMany({
        where: archivedParam === "true"
            ? { clubId: user.club.id, archived: true }
            : archivedParam === "false"
                ? { clubId: user.club.id, archived: false }
                : { clubId: user.club.id }
    });

    const eventIds = events.map((event) => event.id);
    const taskCounts = eventIds.length === 0 ? [] : await db
        .select({
            eventId: tasksTable.eventId,
            total: count(),
            completed: count(sql`case when ${tasksTable.progress} = 'completed' then 1 end`)
        })
        .from(tasksTable)
        .where(inArray(tasksTable.eventId, eventIds))
        .groupBy(tasksTable.eventId);

    const taskCountsByEvent = new Map(taskCounts.map((row) => [row.eventId, row]));
    const eventsWithProgress: ClubEventWithTaskProgress[] = events.map((event) => ({
        ...event,
        taskProgress: {
            total: taskCountsByEvent.get(event.id)?.total ?? 0,
            completed: taskCountsByEvent.get(event.id)?.completed ?? 0
        }
    }));

    return c.json(eventsWithProgress);
});

eventsApp.post("/", async (c) => {
    const user = c.var.user;
    const db = c.get('db');
    const body = await c.req.json();

    if (user.role != "admin" && user.role != "exec") {
        throw new HTTPException(403, { message: "Only club admins and execs can create events" });
    }

    const parsed = UpdateEventSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: describeZodError(parsed.error) });

    const newEvent = await db
        .insert(eventsTable)
        .values({...parsed.data, clubId: user.club.id});
    return c.json({ message: "Created" }, 201)
})

eventsApp.get("/:id{[0-9]+}", async (c) => {
    const eventId = Number(c.req.param("id"));
    const db = c.get('db');
    const user = c.var.user;

    const event = await db.query.eventsTable.findFirst({
        where: { id: eventId, clubId: user.club.id }
    })

    if (!event) throw new HTTPException(404, { message: "Event not found" });
    if (event.archived && user.role !== "admin" && user.role !== "exec") throw new HTTPException(404, { message: "Event not found" });

    return c.json(event);
});

eventsApp.put("/:id{[0-9]+}", async (c) => {
    const eventId = Number(c.req.param("id"));
    const db = c.get("db");
    const user = c.var.user;
    const body = await c.req.json();

    const parsed = UpdateEventSchema.safeParse(body);

    if (!parsed.success) throw new HTTPException(400, { message: describeZodError(parsed.error) });

    const existingEvent = await db.query.eventsTable.findFirst({
        where: { id: eventId, clubId: user.club.id }
    });

    if (!existingEvent) throw new HTTPException(404, { message: "Event not found or unauthorized" });
    if (existingEvent.archived || ( user.role !== "admin" && user.role !== "exec")) {
        throw new HTTPException(404, { message: "Event not found or unauthorized" });
    }

    const [updatedEvent] = await db
        .update(eventsTable)
        .set(parsed.data)
        .where(and(eq(eventsTable.clubId, user.club.id), eq(eventsTable.id, eventId)))
        .returning();

    if (!updatedEvent) throw new HTTPException(404, { message: "Event not found or unauthorized" });

    return c.json(updatedEvent);
});

eventsApp.patch("/:id{[0-9]+}/archive", async (c) => {
    const eventId = Number(c.req.param("id"));
    const db = c.get("db");
    const user = c.var.user;

    if (user.role !== "admin" && user.role !== "exec") throw new HTTPException(403, { message: "Only club admins and execs can archive or unarchive events" });

    const body = await c.req.json();
    const parsed = ArchiveEventSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: describeZodError(parsed.error) });

    const [updatedEvent] = await db
        .update(eventsTable)
        .set({ archived: parsed.data.archived })
        .where(and(eq(eventsTable.clubId, user.club.id), eq(eventsTable.id, eventId)))
        .returning();

    if (!updatedEvent) throw new HTTPException(404, { message: "Event not found or unauthorized" });

    return c.json(updatedEvent);
});

eventsApp.patch("/:id{[0-9]+}/attendance", async (c) => {
    const eventId = Number(c.req.param("id"));
    const db = c.get("db");
    const user = c.var.user;

    if (user.role !== "admin" && user.role !== "exec") throw new HTTPException(403, { message: "Only club admins and execs can open or close attendance" });

    const body = await c.req.json();
    const parsed = SetAttendanceOpenSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: describeZodError(parsed.error) });

    const existingEvent = await db.query.eventsTable.findFirst({
        where: { id: eventId, clubId: user.club.id }
    });
    if (!existingEvent) throw new HTTPException(404, { message: "Event not found or unauthorized" });
    if (existingEvent.archived) throw new HTTPException(404, { message: "Event not found or unauthorized" });

    const [updatedEvent] = await db
        .update(eventsTable)
        .set({ attendanceOpen: parsed.data.attendanceOpen })
        .where(and(eq(eventsTable.clubId, user.club.id), eq(eventsTable.id, eventId)))
        .returning();

    if (!updatedEvent) throw new HTTPException(404, { message: "Event not found or unauthorized" });

    return c.json(updatedEvent);
});

type ExpenseRow = Awaited<ReturnType<typeof loadExpenses>>[number];

function loadExpenses(db: Db, eventId: number, createdBy?: number) {
    return db.query.expensesTable.findMany({
        where: createdBy === undefined ? { eventId } : { eventId, createdBy },
        with: { category: true, creator: true },
        orderBy: { id: "asc" }
    });
}

function toExpenseWithRelations(expense: ExpenseRow): ExpenseWithRelations {
    const { category, creator, ...rest } = expense;
    return {
        ...rest,
        category: { id: category!.id, name: category!.name },
        creator: { id: creator!.id, name: creator!.name }
    };
}

async function loadEventBudget(db: Db, eventId: number): Promise<EventBudgetSummary> {
    const [categories, expenses] = await Promise.all([
        db.query.budgetCategoriesTable.findMany({
            where: { eventId },
            orderBy: { id: "asc" }
        }),
        loadExpenses(db, eventId)
    ]);

    const spentByCategory = new Map<number, number>();
    for (const expense of expenses) {
        spentByCategory.set(expense.categoryId, (spentByCategory.get(expense.categoryId) ?? 0) + expense.amount);
    }

    return {
        scope: "full",
        categories: categories.map((category) => ({
            ...category,
            spent: spentByCategory.get(category.id) ?? 0
        })),
        expenses: expenses.map(toExpenseWithRelations),
        totalAllocated: categories.reduce((sum, category) => sum + category.allocatedAmount, 0),
        totalSpent: expenses.reduce((sum, expense) => sum + expense.amount, 0)
    };
}

async function loadMemberBudget(db: Db, eventId: number, userId: number): Promise<MemberBudgetView> {
    const [categories, expenses] = await Promise.all([
        db.query.budgetCategoriesTable.findMany({
            where: { eventId },
            columns: { id: true, name: true },
            orderBy: { id: "asc" }
        }),
        loadExpenses(db, eventId, userId)
    ]);

    return {
        scope: "own",
        categories,
        expenses: expenses.map(toExpenseWithRelations)
    };
}

eventsApp.get("/:id{[0-9]+}/budget", async (c) => {
    const eventId = Number(c.req.param("id"));
    const db = c.get("db");
    const user = c.var.user;

    const event = await db.query.eventsTable.findFirst({
        where: { id: eventId, clubId: user.club.id }
    });
    if (!event) throw new HTTPException(404, { message: "Event not found" });

    if (!isExecOrAdmin(user.role)) {
        return c.json(await loadMemberBudget(db, eventId, user.id));
    }
    return c.json(await loadEventBudget(db, eventId));
});

// Replaces the event's full set of budget categories: rows with an id are updated,
// rows without one are created, and existing categories missing from the payload are deleted.
eventsApp.put("/:id{[0-9]+}/budget", async (c) => {
    const eventId = Number(c.req.param("id"));
    const db = c.get("db");
    const user = c.var.user;
    if (!isExecOrAdmin(user.role)) throw new HTTPException(403);

    const body = await c.req.json();
    const parsed = SetEventBudgetSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: describeZodError(parsed.error) });

    const event = await db.query.eventsTable.findFirst({
        where: { id: eventId, clubId: user.club.id }
    });
    if (!event) throw new HTTPException(404, { message: "Event not found" });

    const existingCategories = await db.query.budgetCategoriesTable.findMany({ where: { eventId } });
    const existingIds = new Set(existingCategories.map((category) => category.id));

    const toUpdate = parsed.data.categories.filter((category) => category.id !== undefined);
    const toCreate = parsed.data.categories.filter((category) => category.id === undefined);
    if (toUpdate.some((category) => !existingIds.has(category.id!))) {
        throw new HTTPException(400, { message: "One or more categories do not belong to this event" });
    }

    const keptIds = new Set(toUpdate.map((category) => category.id!));
    const toDelete = existingCategories.filter((category) => !keptIds.has(category.id));
    if (toDelete.length > 0) {
        const expenseInUse = await db.query.expensesTable.findFirst({
            where: { categoryId: { in: toDelete.map((category) => category.id) } },
            with: { category: true }
        });
        if (expenseInUse) {
            throw new HTTPException(409, {
                message: `"${expenseInUse.category!.name}" has expenses logged against it and cannot be removed`
            });
        }
    }

    await db.transaction(async (tx) => {
        if (toDelete.length > 0) {
            await tx.delete(budgetCategoriesTable).where(inArray(budgetCategoriesTable.id, toDelete.map((category) => category.id)));
        }
        // Park renamed categories on a placeholder name first so swapping names never trips the unique constraint
        for (const category of toUpdate) {
            await tx
                .update(budgetCategoriesTable)
                .set({ name: `__pending_${category.id}` })
                .where(eq(budgetCategoriesTable.id, category.id!));
        }
        for (const category of toUpdate) {
            await tx
                .update(budgetCategoriesTable)
                .set({ name: category.name, allocatedAmount: category.allocatedAmount })
                .where(eq(budgetCategoriesTable.id, category.id!));
        }
        if (toCreate.length > 0) {
            await tx.insert(budgetCategoriesTable).values(
                toCreate.map((category) => ({
                    eventId,
                    name: category.name,
                    allocatedAmount: category.allocatedAmount
                }))
            );
        }
    });

    return c.json(await loadEventBudget(db, eventId));
});

eventsApp.post("/:id{[0-9]+}/expenses", async (c) => {
    const eventId = Number(c.req.param("id"));
    const db = c.get("db");
    const user = c.var.user;

    const body = await c.req.json();
    const parsed = CreateExpenseSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: "Invalid payload" });

    const event = await db.query.eventsTable.findFirst({
        where: { id: eventId, clubId: user.club.id }
    });
    if (!event) throw new HTTPException(404, { message: "Event not found" });

    const category = await db.query.budgetCategoriesTable.findFirst({
        where: { id: parsed.data.categoryId, eventId }
    });
    if (!category) throw new HTTPException(400, { message: "Category does not belong to this event" });

    const [expense] = await db
        .insert(expensesTable)
        .values({
            eventId,
            categoryId: parsed.data.categoryId,
            amount: parsed.data.amount,
            description: parsed.data.description,
            createdBy: user.id
        })
        .returning();

    return c.json(expense, 201);
});

eventsApp.get("/:id{[0-9]+}/documents", async (c) => {
    const eventId = Number(c.req.param("id"));
    const db = c.get("db");
    const user = c.var.user;

    const event = await db.query.eventsTable.findFirst({
        where: { id: eventId, clubId: user.club.id }
    });
    if (!event) throw new HTTPException(404, { message: "Event not found" });

    const documents = await db.query.eventDocumentsTable.findMany({
        where: { eventId },
        with: { addedByUser: { columns: { id: true, name: true } } },
        orderBy: { createdAt: "desc", id: "desc" }
    });

    return c.json(documents);
});

eventsApp.post("/:id{[0-9]+}/documents", async (c) => {
    const eventId = Number(c.req.param("id"));
    const db = c.get("db");
    const user = c.var.user;

    const body = await c.req.json();
    const parsed = CreateEventDocumentSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: describeZodError(parsed.error) });

    const event = await db.query.eventsTable.findFirst({
        where: { id: eventId, clubId: user.club.id }
    });
    if (!event) throw new HTTPException(404, { message: "Event not found" });

    const [document] = await db
        .insert(eventDocumentsTable)
        .values({ eventId, title: parsed.data.title, url: parsed.data.url, addedBy: user.id })
        .returning();

    return c.json(document, 201);
});

export { eventsApp };