import {Hono} from "hono";
import {isAuthenticated, type UserEnv} from "../services/auth.ts";
import type {DbEnv} from "../db/connection.ts";
import {zValidator} from "@hono/zod-validator";
import { z } from 'zod';
import {HTTPException} from "hono/http-exception";
import {ArchiveEventSchema, type ClubEventWithTaskProgress, SetAttendanceOpenSchema, UpdateEventSchema} from "../types/events.ts";
import {CreateExpenseSchema, SetEventBudgetsSchema} from "../types/budget.ts";
import {clubsTable, eventsTable, budgetCategoriesTable, eventBudgetsTable, expensesTable, tasksTable} from "../db/schema.ts";
import {and, count, eq, inArray, sql} from "drizzle-orm";
import {describeZodError} from "../types/errors.ts";

function isExecOrAdmin(role: string): boolean {
    return role === "exec" || role === "admin";
}

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

eventsApp.get("/:id{[0-9]+}/budget", async (c) => {
    const eventId = Number(c.req.param("id"));
    const db = c.get("db");
    const user = c.var.user;
    if (!isExecOrAdmin(user.role)) throw new HTTPException(403);

    const event = await db.query.eventsTable.findFirst({
        where: { id: eventId, clubId: user.club.id }
    });
    if (!event) throw new HTTPException(404, { message: "Event not found" });

    const allocations = await db.query.eventBudgetsTable.findMany({
        where: { eventId },
        with: { category: true }
    });

    const expenses = await db.query.expensesTable.findMany({
        where: { eventId },
        with: { category: true, creator: true }
    });

    const spentByCategory = new Map<number, number>();
    for (const expense of expenses) {
        spentByCategory.set(expense.categoryId, (spentByCategory.get(expense.categoryId) ?? 0) + expense.amount);
    }

    const allocationLines = allocations.map((allocation) => ({
        ...allocation,
        spent: spentByCategory.get(allocation.categoryId) ?? 0
    }));

    const totalAllocated = allocations.reduce((sum, allocation) => sum + allocation.allocatedAmount, 0);
    const totalSpent = expenses.reduce((sum, expense) => sum + expense.amount, 0);

    return c.json({
        allocations: allocationLines,
        expenses: expenses.map((expense) => ({
            ...expense,
            creator: { id: expense.creator!.id, name: expense.creator!.name }
        })),
        totalAllocated,
        totalSpent
    });
});

eventsApp.put("/:id{[0-9]+}/budget", async (c) => {
    const eventId = Number(c.req.param("id"));
    const db = c.get("db");
    const user = c.var.user;
    if (!isExecOrAdmin(user.role)) throw new HTTPException(403);

    const body = await c.req.json();
    const parsed = SetEventBudgetsSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: "Invalid payload" });

    const event = await db.query.eventsTable.findFirst({
        where: { id: eventId, clubId: user.club.id }
    });
    if (!event) throw new HTTPException(404, { message: "Event not found" });

    const categoryIds = parsed.data.allocations.map((allocation) => allocation.categoryId);
    if (categoryIds.length > 0) {
        const categories = await db.query.budgetCategoriesTable.findMany({
            where: { id: { in: categoryIds }, clubId: user.club.id }
        });
        if (categories.length !== new Set(categoryIds).size) {
            throw new HTTPException(400, { message: "One or more categories do not belong to this club" });
        }
    }

    await db.transaction(async (tx) => {
        await tx.delete(eventBudgetsTable).where(eq(eventBudgetsTable.eventId, eventId));
        if (parsed.data.allocations.length > 0) {
            await tx.insert(eventBudgetsTable).values(
                parsed.data.allocations.map((allocation) => ({
                    eventId,
                    categoryId: allocation.categoryId,
                    allocatedAmount: allocation.allocatedAmount
                }))
            );
        }
    });

    const allocations = await db.query.eventBudgetsTable.findMany({
        where: { eventId },
        with: { category: true }
    });

    return c.json(allocations);
});

eventsApp.post("/:id{[0-9]+}/expenses", async (c) => {
    const eventId = Number(c.req.param("id"));
    const db = c.get("db");
    const user = c.var.user;
    if (!isExecOrAdmin(user.role)) throw new HTTPException(403);

    const body = await c.req.json();
    const parsed = CreateExpenseSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: "Invalid payload" });

    const event = await db.query.eventsTable.findFirst({
        where: { id: eventId, clubId: user.club.id }
    });
    if (!event) throw new HTTPException(404, { message: "Event not found" });

    const category = await db.query.budgetCategoriesTable.findFirst({
        where: { id: parsed.data.categoryId, clubId: user.club.id }
    });
    if (!category) throw new HTTPException(400, { message: "Category does not belong to this club" });

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

export { eventsApp };