import {Hono} from "hono";
import {isAuthenticated, type UserEnv} from "../services/auth.ts";
import type {DbEnv} from "../db/connection.ts";
import {zValidator} from "@hono/zod-validator";
import { z } from 'zod';
import {HTTPException} from "hono/http-exception";
import {ArchiveEventSchema, DuplicateEventSchema, type ClubEventWithTaskProgress, SetAttendanceOpenSchema, UpdateEventSchema} from "../types/events.ts";
import {
    CreateExpenseSchema,
    CreateIncomeSchema,
    SetEventBudgetSchema,
    type EventBudgetSummary,
    type ExpenseWithRelations,
    type IncomeWithCreator,
    type MemberBudgetView
} from "../types/budget.ts";
import {CreateEventDocumentSchema} from "../types/event-documents.ts";
import {SetEventTeamSchema, type EventTeamMember} from "../types/event-team.ts";
import {
    budgetCategoriesTable,
    clubsTable,
    eventAttendanceTable,
    eventDocumentsTable,
    eventMembersTable,
    eventsTable,
    expensesTable,
    incomeTable,
    taskAssignmentsTable,
    taskDependenciesTable,
    taskAuditLogTable,
    taskDocumentsTable,
    tasksTable,
    usersTable
} from "../db/schema.ts";
import {and, count, eq, inArray, sql} from "drizzle-orm";
import {describeZodError} from "../types/errors.ts";
import {eventAccess} from "../services/event-access.ts";

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
            ? { ...eventAccess(user), archived: true }
            : archivedParam === "false"
                ? { ...eventAccess(user), archived: false }
                : eventAccess(user)
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

// Clones an existing event (archived events work as templates). Tasks come across reset to
// backlog with due dates shifted by the same offset as the event, and without assignees or
// documents. Budget categories come across with their allocations but without expenses.
eventsApp.post("/:id{[0-9]+}/duplicate", async (c) => {
    const sourceId = Number(c.req.param("id"));
    const db = c.get("db");
    const user = c.var.user;

    if (!isExecOrAdmin(user.role)) throw new HTTPException(403, { message: "Only club admins and execs can duplicate events" });

    const body = await c.req.json();
    const parsed = DuplicateEventSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: describeZodError(parsed.error) });
    const { includeTasks, includeBudget, ...details } = parsed.data;

    const source = await db.query.eventsTable.findFirst({
        where: { id: sourceId, clubId: user.club.id }
    });
    if (!source) throw new HTTPException(404, { message: "Event not found" });

    const shiftMs = details.start.getTime() - source.start.getTime();

    const created = await db.transaction(async (tx) => {
        const [newEvent] = await tx
            .insert(eventsTable)
            .values({ ...details, clubId: user.club.id })
            .returning();
        if (!newEvent) throw new HTTPException(500, { message: "Failed to create event" });

        if (includeBudget) {
            const categories = await tx.query.budgetCategoriesTable.findMany({
                where: { eventId: sourceId },
                orderBy: { id: "asc" }
            });
            if (categories.length > 0) {
                await tx.insert(budgetCategoriesTable).values(
                    categories.map((category) => ({
                        eventId: newEvent.id,
                        name: category.name,
                        allocatedAmount: category.allocatedAmount
                    }))
                );
            }
        }

        if (includeTasks) {
            const sourceTasks = await tx.query.tasksTable.findMany({
                where: { eventId: sourceId },
                orderBy: { id: "asc" }
            });
            const newIdBySourceId = new Map<number, number>();

            for (const task of sourceTasks) {
                const [copy] = await tx
                    .insert(tasksTable)
                    .values({
                        eventId: newEvent.id,
                        title: task.title,
                        description: task.description,
                        priority: task.priority,
                        dueDate: task.dueDate ? new Date(task.dueDate.getTime() + shiftMs) : null,
                        createdBy: user.id
                    })
                    .returning();
                if (!copy) throw new HTTPException(500, { message: "Failed to duplicate tasks" });
                newIdBySourceId.set(task.id, copy.id);

                await tx.insert(taskAuditLogTable).values({
                    taskId: copy.id,
                    changedBy: user.id,
                    action: "created",
                    changes: { duplicatedFromTaskId: task.id, duplicatedFromEventId: sourceId }
                });
            }

            const sourceDependencies = sourceTasks.length === 0 ? [] : await tx
                .select()
                .from(taskDependenciesTable)
                .where(inArray(taskDependenciesTable.taskId, sourceTasks.map((task) => task.id)));
            const dependencies = sourceDependencies.flatMap((dependency) => {
                const taskId = newIdBySourceId.get(dependency.taskId);
                const dependsOnTaskId = newIdBySourceId.get(dependency.dependsOnTaskId);
                return taskId && dependsOnTaskId ? [{ taskId, dependsOnTaskId }] : [];
            });
            if (dependencies.length > 0) {
                await tx.insert(taskDependenciesTable).values(dependencies);
            }
        }

        return newEvent;
    });

    return c.json(created, 201);
});

eventsApp.get("/:id{[0-9]+}", async (c) => {
    const eventId = Number(c.req.param("id"));
    const db = c.get('db');
    const user = c.var.user;

    const event = await db.query.eventsTable.findFirst({
        where: { id: eventId, ...eventAccess(user) }
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
        where: { id: eventId, ...eventAccess(user) }
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

// Permanently removes an event and everything that hangs off it. The task audit log is
// insert-only, so its rows are deliberately left in place.
eventsApp.delete("/:id{[0-9]+}", async (c) => {
    const eventId = Number(c.req.param("id"));
    const db = c.get("db");
    const user = c.var.user;

    if (!isExecOrAdmin(user.role)) throw new HTTPException(403, { message: "Only club admins and execs can delete events" });

    const event = await db.query.eventsTable.findFirst({
        where: { id: eventId, ...eventAccess(user) }
    });
    if (!event) throw new HTTPException(404, { message: "Event not found or unauthorized" });

    await db.transaction(async (tx) => {
        const taskIds = (await tx.select({ id: tasksTable.id }).from(tasksTable).where(eq(tasksTable.eventId, eventId)))
            .map((task) => task.id);

        if (taskIds.length > 0) {
            await tx.delete(taskAssignmentsTable).where(inArray(taskAssignmentsTable.taskId, taskIds));
            await tx.delete(taskDependenciesTable).where(inArray(taskDependenciesTable.taskId, taskIds));
            await tx.delete(taskDependenciesTable).where(inArray(taskDependenciesTable.dependsOnTaskId, taskIds));
            await tx.delete(taskDocumentsTable).where(inArray(taskDocumentsTable.taskId, taskIds));
            await tx.delete(tasksTable).where(inArray(tasksTable.id, taskIds));
        }

        await tx.delete(expensesTable).where(eq(expensesTable.eventId, eventId));
        await tx.delete(budgetCategoriesTable).where(eq(budgetCategoriesTable.eventId, eventId));
        await tx.delete(eventAttendanceTable).where(eq(eventAttendanceTable.eventId, eventId));
        await tx.delete(eventMembersTable).where(eq(eventMembersTable.eventId, eventId));
        await tx.delete(eventsTable).where(and(eq(eventsTable.id, eventId), eq(eventsTable.clubId, user.club.id)));
    });

    return c.json({ message: "Deleted" });
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
        where: { id: eventId, ...eventAccess(user) }
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

async function loadIncome(db: Db, eventId: number): Promise<IncomeWithCreator[]> {
    const rows = await db.query.incomeTable.findMany({
        where: { eventId },
        with: { creator: true },
        orderBy: { id: "asc" }
    });
    return rows.map(({ creator, ...rest }) => ({
        ...rest,
        creator: { id: creator!.id, name: creator!.name }
    }));
}

async function loadEventBudget(db: Db, eventId: number): Promise<EventBudgetSummary> {
    const [categories, expenses, income] = await Promise.all([
        db.query.budgetCategoriesTable.findMany({
            where: { eventId },
            orderBy: { id: "asc" }
        }),
        loadExpenses(db, eventId),
        loadIncome(db, eventId)
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
        totalSpent: expenses.reduce((sum, expense) => sum + expense.amount, 0),
        income,
        totalIncome: income.reduce((sum, entry) => sum + entry.amount, 0),
        totalOwed: expenses
            .filter((expense) => expense.paidPersonally && !expense.reimbursedAt)
            .reduce((sum, expense) => sum + expense.amount, 0)
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
        where: { id: eventId, ...eventAccess(user) }
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
        where: { id: eventId, ...eventAccess(user) }
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
        where: { id: eventId, ...eventAccess(user) }
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
            paidPersonally: parsed.data.paidPersonally,
            createdBy: user.id
        })
        .returning();

    return c.json(expense, 201);
});

// Only execs and admins handle money coming in; standard members never see or add income.
eventsApp.post("/:id{[0-9]+}/income", async (c) => {
    const eventId = Number(c.req.param("id"));
    const db = c.get("db");
    const user = c.var.user;
    if (!isExecOrAdmin(user.role)) throw new HTTPException(403);

    const body = await c.req.json();
    const parsed = CreateIncomeSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: describeZodError(parsed.error) });

    const event = await db.query.eventsTable.findFirst({
        where: { id: eventId, ...eventAccess(user) }
    });
    if (!event) throw new HTTPException(404, { message: "Event not found" });

    const [income] = await db
        .insert(incomeTable)
        .values({
            eventId,
            source: parsed.data.source,
            amount: parsed.data.amount,
            description: parsed.data.description || null,
            createdBy: user.id
        })
        .returning();

    return c.json(income, 201);
});

eventsApp.get("/:id{[0-9]+}/documents", async (c) => {
    const eventId = Number(c.req.param("id"));
    const db = c.get("db");
    const user = c.var.user;

    const event = await db.query.eventsTable.findFirst({
        where: { id: eventId, ...eventAccess(user) }
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
        where: { id: eventId, ...eventAccess(user) }
    });
    if (!event) throw new HTTPException(404, { message: "Event not found" });

    const [document] = await db
        .insert(eventDocumentsTable)
        .values({ eventId, title: parsed.data.title, url: parsed.data.url, addedBy: user.id })
        .returning();

    return c.json(document, 201);
});

eventsApp.get("/:id{[0-9]+}/team", async (c) => {
    const eventId = Number(c.req.param("id"));
    const db = c.get("db");
    const user = c.var.user;

    const event = await db.query.eventsTable.findFirst({
        where: { id: eventId, clubId: user.club.id }
    });
    if (!event) throw new HTTPException(404, { message: "Event not found" });

    const team: EventTeamMember[] = await db
        .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role })
        .from(eventMembersTable)
        .innerJoin(usersTable, eq(usersTable.id, eventMembersTable.userId))
        .where(eq(eventMembersTable.eventId, eventId))
        .orderBy(usersTable.name, usersTable.id) as EventTeamMember[];

    return c.json(team);
});

// Replaces the whole team (and optionally who can see the event) in one go, so the picker can just send what it shows.
eventsApp.put("/:id{[0-9]+}/team", async (c) => {
    const eventId = Number(c.req.param("id"));
    const db = c.get("db");
    const user = c.var.user;

    if (!isExecOrAdmin(user.role)) throw new HTTPException(403, { message: "Only club admins and execs can assign members to events" });

    const body = await c.req.json();
    const parsed = SetEventTeamSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: describeZodError(parsed.error) });
    const { userIds, teamWide } = parsed.data;

    const event = await db.query.eventsTable.findFirst({
        where: { id: eventId, clubId: user.club.id }
    });
    if (!event) throw new HTTPException(404, { message: "Event not found" });

    if (userIds.length > 0) {
        const validMembers = await db
            .select({ id: usersTable.id })
            .from(usersTable)
            .where(and(
                inArray(usersTable.id, userIds),
                eq(usersTable.clubId, user.club.id),
                eq(usersTable.status, "active")
            ));
        if (validMembers.length !== userIds.length) {
            throw new HTTPException(400, { message: "Every assigned user must be an active member of this club" });
        }
    }

    await db.transaction(async (tx) => {
        if (teamWide !== undefined) {
            await tx.update(eventsTable).set({ teamWide }).where(eq(eventsTable.id, eventId));
        }
        await tx.delete(eventMembersTable).where(eq(eventMembersTable.eventId, eventId));
        if (userIds.length > 0) {
            await tx.insert(eventMembersTable).values(userIds.map((userId) => ({ eventId, userId })));
        }
    });

    const team = await db
        .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role })
        .from(eventMembersTable)
        .innerJoin(usersTable, eq(usersTable.id, eventMembersTable.userId))
        .where(eq(eventMembersTable.eventId, eventId))
        .orderBy(usersTable.name, usersTable.id);

    return c.json(team);
});

export { eventsApp };