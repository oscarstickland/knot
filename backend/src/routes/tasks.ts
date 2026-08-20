import { Hono } from "hono";
import { isAuthenticated, type UserEnv } from "../services/auth.ts";
import type { DbEnv } from "../db/connection.ts";
import { HTTPException } from "hono/http-exception";
import {
    AddTaskDocumentSchema,
    CreateTaskSchema,
    UpdateTaskProgressSchema,
    UpdateTaskSchema
} from "../types/tasks.ts";
import {
    taskAssignmentsTable,
    taskAuditLogTable,
    taskDependenciesTable,
    taskDocumentsTable,
    tasksTable
} from "../db/schema.ts";
import { eq } from "drizzle-orm";

type Db = DbEnv["Variables"]["db"];

const tasksApp = new Hono<UserEnv & DbEnv>();
tasksApp.use("*", isAuthenticated);

function isExecOrAdmin(role: string): boolean {
    return role === "exec" || role === "admin";
}

async function loadClubTask(db: Db, taskId: number, clubId: number) {
    const task = await db.query.tasksTable.findFirst({
        where: { id: taskId },
        with: { event: true }
    });

    if (!task || !task.event || task.event.clubId !== clubId) return null;
    return task;
}

async function isAssignedToTask(db: Db, taskId: number, userId: number): Promise<boolean> {
    const assignment = await db.query.taskAssignmentsTable.findFirst({
        where: { taskId, userId }
    });
    return !!assignment;
}

async function assertUsersInClub(db: Db, userIds: number[], clubId: number) {
    if (userIds.length === 0) return;

    const members = await db.query.usersTable.findMany({
        where: { id: { in: userIds }, clubId }
    });

    if (members.length !== new Set(userIds).size) {
        throw new HTTPException(400, { message: "One or more assignees are not members of this club" });
    }
}

async function assertDependenciesInEvent(db: Db, dependencyIds: number[], eventId: number, taskId: number | null) {
    if (dependencyIds.length === 0) return;

    if (taskId !== null && dependencyIds.includes(taskId)) {
        throw new HTTPException(400, { message: "A task cannot depend on itself" });
    }

    const dependencyTasks = await db.query.tasksTable.findMany({
        where: { id: { in: dependencyIds }, eventId }
    });

    if (dependencyTasks.length !== new Set(dependencyIds).size) {
        throw new HTTPException(400, { message: "One or more dependencies do not belong to this event" });
    }
}

async function assertNoDependencyCycle(db: Db, eventId: number, taskId: number, dependencyIds: number[]) {
    if (dependencyIds.length === 0) return;

    const existingDependencies = await db
        .select({ taskId: taskDependenciesTable.taskId, dependsOnTaskId: taskDependenciesTable.dependsOnTaskId })
        .from(taskDependenciesTable)
        .innerJoin(tasksTable, eq(tasksTable.id, taskDependenciesTable.taskId))
        .where(eq(tasksTable.eventId, eventId));

    const adjacency = new Map<number, number[]>();
    for (const dependency of existingDependencies) {
        if (dependency.taskId === taskId) continue;
        const existing = adjacency.get(dependency.taskId) ?? [];
        existing.push(dependency.dependsOnTaskId);
        adjacency.set(dependency.taskId, existing);
    }

    function canReach(from: number, target: number, visited: Set<number>): boolean {
        if (from === target) return true;
        if (visited.has(from)) return false;
        visited.add(from);
        for (const next of adjacency.get(from) ?? []) {
            if (canReach(next, target, visited)) return true;
        }
        return false;
    }

    for (const dependencyId of dependencyIds) {
        if (canReach(dependencyId, taskId, new Set())) {
            throw new HTTPException(400, { message: "This dependency would create a circular dependency" });
        }
    }
}

async function assertDependenciesCompleted(db: Db, taskId: number) {
    const dependencies = await db.query.taskDependenciesTable.findMany({
        where: { taskId },
        with: { dependsOnTask: true }
    });

    const incomplete = dependencies.filter((dependency) => dependency.dependsOnTask?.progress !== "completed");
    if (incomplete.length > 0) {
        throw new HTTPException(400, { message: "All dependencies must be completed before this task can be completed" });
    }
}

tasksApp.get("/", async (c) => {
    const user = c.var.user;
    const db = c.get("db");
    const eventId = Number(c.req.query("eventId"));
    if (!eventId) throw new HTTPException(400, { message: "eventId query parameter is required" });

    const event = await db.query.eventsTable.findFirst({
        where: { id: eventId, clubId: user.club.id }
    });
    if (!event) throw new HTTPException(404, { message: "Event not found" });

    const tasks = await db.query.tasksTable.findMany({
        where: { eventId },
        with: { assignments: true, dependsOn: true, documents: true }
    });

    return c.json(tasks);
});

tasksApp.get("/:id{[0-9]+}", async (c) => {
    const user = c.var.user;
    const db = c.get("db");
    const taskId = Number(c.req.param("id"));

    const task = await db.query.tasksTable.findFirst({
        where: { id: taskId },
        with: { event: true, assignments: true, dependsOn: true, documents: true, auditLog: true }
    });

    if (!task || !task.event || task.event.clubId !== user.club.id) throw new HTTPException(404, { message: "Task not found" });

    return c.json(task);
});

tasksApp.post("/", async (c) => {
    const user = c.var.user;
    const db = c.get("db");
    if (!isExecOrAdmin(user.role)) throw new HTTPException(403);

    const body = await c.req.json();
    const parsed = CreateTaskSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: "Invalid payload" });

    const event = await db.query.eventsTable.findFirst({
        where: { id: parsed.data.eventId, clubId: user.club.id }
    });
    if (!event) throw new HTTPException(404, { message: "Event not found" });

    await assertUsersInClub(db, parsed.data.assigneeIds, user.club.id);
    await assertDependenciesInEvent(db, parsed.data.dependencyIds, parsed.data.eventId, null);

    const createdTask = await db.transaction(async (tx) => {
        const [task] = await tx
            .insert(tasksTable)
            .values({
                eventId: parsed.data.eventId,
                title: parsed.data.title,
                description: parsed.data.description,
                priority: parsed.data.priority,
                dueDate: parsed.data.dueDate ?? null,
                createdBy: user.id
            })
            .returning();

        if (!task) throw new HTTPException(500, { message: "Failed to create task" });

        if (parsed.data.assigneeIds.length > 0) {
            await tx.insert(taskAssignmentsTable).values(
                parsed.data.assigneeIds.map((userId) => ({ taskId: task.id, userId }))
            );
        }

        if (parsed.data.dependencyIds.length > 0) {
            await tx.insert(taskDependenciesTable).values(
                parsed.data.dependencyIds.map((dependsOnTaskId) => ({ taskId: task.id, dependsOnTaskId }))
            );
        }

        await tx.insert(taskAuditLogTable).values({
            taskId: task.id,
            changedBy: user.id,
            action: "created",
            changes: parsed.data
        });

        return task;
    });

    return c.json(createdTask, 201);
});

tasksApp.put("/:id{[0-9]+}", async (c) => {
    const user = c.var.user;
    const db = c.get("db");
    if (!isExecOrAdmin(user.role)) throw new HTTPException(403);

    const taskId = Number(c.req.param("id"));
    const body = await c.req.json();
    const parsed = UpdateTaskSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: "Invalid payload" });

    const existingTask = await loadClubTask(db, taskId, user.club.id);
    if (!existingTask) throw new HTTPException(404, { message: "Task not found" });
    if (parsed.data.eventId !== existingTask.eventId) {
        throw new HTTPException(400, { message: "A task cannot be moved to a different event" });
    }

    await assertUsersInClub(db, parsed.data.assigneeIds, user.club.id);
    await assertDependenciesInEvent(db, parsed.data.dependencyIds, existingTask.eventId, taskId);
    await assertNoDependencyCycle(db, existingTask.eventId, taskId, parsed.data.dependencyIds);

    const updatedTask = await db.transaction(async (tx) => {
        const [task] = await tx
            .update(tasksTable)
            .set({
                title: parsed.data.title,
                description: parsed.data.description,
                priority: parsed.data.priority,
                dueDate: parsed.data.dueDate ?? null
            })
            .where(eq(tasksTable.id, taskId))
            .returning();

        await tx.delete(taskAssignmentsTable).where(eq(taskAssignmentsTable.taskId, taskId));
        if (parsed.data.assigneeIds.length > 0) {
            await tx.insert(taskAssignmentsTable).values(
                parsed.data.assigneeIds.map((userId) => ({ taskId, userId }))
            );
        }

        await tx.delete(taskDependenciesTable).where(eq(taskDependenciesTable.taskId, taskId));
        if (parsed.data.dependencyIds.length > 0) {
            await tx.insert(taskDependenciesTable).values(
                parsed.data.dependencyIds.map((dependsOnTaskId) => ({ taskId, dependsOnTaskId }))
            );
        }

        await tx.insert(taskAuditLogTable).values({
            taskId,
            changedBy: user.id,
            action: "updated",
            changes: parsed.data
        });

        return task;
    });

    return c.json(updatedTask);
});

tasksApp.patch("/:id{[0-9]+}/progress", async (c) => {
    const user = c.var.user;
    const db = c.get("db");
    const taskId = Number(c.req.param("id"));

    const existingTask = await loadClubTask(db, taskId, user.club.id);
    if (!existingTask) throw new HTTPException(404, { message: "Task not found" });

    const allowed = isExecOrAdmin(user.role) || await isAssignedToTask(db, taskId, user.id);
    if (!allowed) throw new HTTPException(403);

    const body = await c.req.json();
    const parsed = UpdateTaskProgressSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: "Invalid payload" });

    if (parsed.data.progress === "completed") {
        await assertDependenciesCompleted(db, taskId);
    }

    const updatedTask = await db.transaction(async (tx) => {
        const [task] = await tx
            .update(tasksTable)
            .set({ progress: parsed.data.progress })
            .where(eq(tasksTable.id, taskId))
            .returning();

        await tx.insert(taskAuditLogTable).values({
            taskId,
            changedBy: user.id,
            action: "updated",
            changes: { progress: parsed.data.progress }
        });

        return task;
    });

    return c.json(updatedTask);
});

tasksApp.post("/:id{[0-9]+}/documents", async (c) => {
    const user = c.var.user;
    const db = c.get("db");
    const taskId = Number(c.req.param("id"));

    const existingTask = await loadClubTask(db, taskId, user.club.id);
    if (!existingTask) throw new HTTPException(404, { message: "Task not found" });

    const allowed = isExecOrAdmin(user.role) || await isAssignedToTask(db, taskId, user.id);
    if (!allowed) throw new HTTPException(403);

    const body = await c.req.json();
    const parsed = AddTaskDocumentSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: "Invalid payload" });

    const document = await db.transaction(async (tx) => {
        const [document] = await tx
            .insert(taskDocumentsTable)
            .values({ taskId, url: parsed.data.url, addedBy: user.id })
            .returning();

        await tx.insert(taskAuditLogTable).values({
            taskId,
            changedBy: user.id,
            action: "updated",
            changes: { addedDocumentUrl: parsed.data.url }
        });

        return document;
    });

    return c.json(document, 201);
});

export { tasksApp };
