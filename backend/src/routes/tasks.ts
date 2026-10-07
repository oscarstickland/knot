import { Hono } from "hono";
import { isAuthenticated, type UserEnv } from "../services/auth.ts";
import type { DbEnv } from "../db/connection.ts";
import { HTTPException } from "hono/http-exception";
import {
    AddTaskDocumentSchema,
    CreateTaskCommentSchema,
    CreateTaskSchema,
    UpdateTaskCommentSchema,
    UpdateTaskProgressSchema,
    UpdateTaskSchema
} from "../types/tasks.ts";
import {
    taskAssignmentsTable,
    taskAuditLogTable,
    taskCommentsTable,
    taskDependenciesTable,
    taskDocumentsTable,
    tasksTable
} from "../db/schema.ts";
import { eq } from "drizzle-orm";
import { describeZodError } from "../types/errors.ts";
import { findCyclicDependency } from "../services/task-dependencies.ts";

type Db = DbEnv["Variables"]["db"];

const tasksApp = new Hono<UserEnv & DbEnv>();
tasksApp.use("*", isAuthenticated);

function isExecOrAdmin(role: string): boolean {
    return role === "exec" || role === "admin";
}

// Assignee names are included so members without access to the full member list
// can still see who a task is assigned to.
const assignmentsWithUser = {
    with: { user: { columns: { id: true, name: true } } }
} as const;

async function loadClubTask(db: Db, taskId: number, clubId: number) {
    const task = await db.query.tasksTable.findFirst({
        where: { id: taskId },
        with: { event: true }
    });

    if (!task || !task.event || task.event.clubId !== clubId) return null;
    return task;
}

async function loadTaskComment(db: Db, taskId: number, commentId: number) {
    const comment = await db.query.taskCommentsTable.findFirst({
        where: { id: commentId, taskId }
    });
    return comment ?? null;
}

// Only comment ids are loaded, then swapped for a count, so list responses stay small.
const commentIds = { columns: { id: true } } as const;

function withCommentCount<T extends { comments: { id: number }[] }>(task: T) {
    const { comments, ...rest } = task;
    return { ...rest, commentCount: comments.length };
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

    const uniqueUserIds = new Set(userIds);
    if (members.length !== uniqueUserIds.size) {
        const memberIds = new Set(members.map((member) => member.id));
        const invalidIds = [...uniqueUserIds].filter((id) => !memberIds.has(id));
        throw new HTTPException(400, {
            message: `Cannot assign user(s) with ID ${invalidIds.join(", ")} as they are not members of this club`
        });
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

    const uniqueDependencyIds = new Set(dependencyIds);
    if (dependencyTasks.length !== uniqueDependencyIds.size) {
        const foundIds = new Set(dependencyTasks.map((task) => task.id));
        const invalidIds = [...uniqueDependencyIds].filter((id) => !foundIds.has(id));
        throw new HTTPException(400, {
            message: `Cannot depend on task ID ${invalidIds.join(", ")} as it does not belong to this event`
        });
    }
}

async function assertNoDependencyCycle(db: Db, eventId: number, taskId: number, dependencyIds: number[]) {
    if (dependencyIds.length === 0) return;

    const existingDependencies = await db
        .select({ taskId: taskDependenciesTable.taskId, dependsOnTaskId: taskDependenciesTable.dependsOnTaskId })
        .from(taskDependenciesTable)
        .innerJoin(tasksTable, eq(tasksTable.id, taskDependenciesTable.taskId))
        .where(eq(tasksTable.eventId, eventId));

    const cyclicDependencyId = findCyclicDependency(existingDependencies, taskId, dependencyIds);
    if (cyclicDependencyId === null) return;

    const dependencyTask = await db.query.tasksTable.findFirst({ where: { id: cyclicDependencyId } });
    const dependencyName = dependencyTask?.title ?? `Task ${cyclicDependencyId}`;
    throw new HTTPException(400, {
        message: `Cannot depend on "${dependencyName}" as it already depends on this task, either directly or transitively`
    });
}

async function assertDependenciesCompleted(db: Db, taskId: number, taskTitle: string) {
    const dependencies = await db.query.taskDependenciesTable.findMany({
        where: { taskId },
        with: { dependsOnTask: true }
    });

    const incomplete = dependencies.filter((dependency) => dependency.dependsOnTask?.progress !== "completed");
    if (incomplete.length > 0) {
        const incompleteTitles = incomplete.map((dependency) => dependency.dependsOnTask?.title ?? "an unknown task");
        throw new HTTPException(400, {
            message: `${taskTitle} cannot be completed as it requires ${incompleteTitles.join(", ")} to be completed`
        });
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
        with: { assignments: assignmentsWithUser, dependsOn: true, documents: true, comments: commentIds }
    });

    return c.json(tasks.map(withCommentCount));
});


tasksApp.get("/me", async (c) => {
    const user = c.var.user;
    const db = c.get("db");

    const tasks = await db.query.tasksTable.findMany({
        where: {
            assignments: { userId: user.id },
            event: { clubId: user.club.id }
        },
        with: { event: true, assignments: assignmentsWithUser, dependsOn: true, documents: true, comments: commentIds }
    });

    return c.json(tasks.map(withCommentCount));
})

tasksApp.get("/:id{[0-9]+}", async (c) => {
    const user = c.var.user;
    const db = c.get("db");
    const taskId = Number(c.req.param("id"));

    const task = await db.query.tasksTable.findFirst({
        where: { id: taskId },
        with: { event: true, assignments: assignmentsWithUser, dependsOn: true, documents: true, auditLog: true, comments: commentIds }
    });

    if (!task || !task.event || task.event.clubId !== user.club.id) throw new HTTPException(404, { message: "Task not found" });

    return c.json(withCommentCount(task));
});

tasksApp.post("/", async (c) => {
    const user = c.var.user;
    const db = c.get("db");
    if (!isExecOrAdmin(user.role)) throw new HTTPException(403, { message: "Only club admins and execs can create tasks" });

    const body = await c.req.json();
    const parsed = CreateTaskSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: describeZodError(parsed.error) });

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
    if (!isExecOrAdmin(user.role)) throw new HTTPException(403, { message: "Only club admins and execs can edit tasks" });

    const taskId = Number(c.req.param("id"));
    const body = await c.req.json();
    const parsed = UpdateTaskSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: describeZodError(parsed.error) });

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
    if (!allowed) throw new HTTPException(403, { message: "Only club admins, execs, or users assigned to this task can update its progress" });

    const body = await c.req.json();
    const parsed = UpdateTaskProgressSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: describeZodError(parsed.error) });

    if (parsed.data.progress === "completed") {
        await assertDependenciesCompleted(db, taskId, existingTask.title);
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
    if (!allowed) throw new HTTPException(403, { message: "Only club admins, execs, or users assigned to this task can add documents to it" });

    const body = await c.req.json();
    const parsed = AddTaskDocumentSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: describeZodError(parsed.error) });

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

tasksApp.get("/:id{[0-9]+}/comments", async (c) => {
    const user = c.var.user;
    const db = c.get("db");
    const taskId = Number(c.req.param("id"));

    const existingTask = await loadClubTask(db, taskId, user.club.id);
    if (!existingTask) throw new HTTPException(404, { message: "Task not found" });

    const comments = await db.query.taskCommentsTable.findMany({
        where: { taskId },
        orderBy: { createdAt: "asc", id: "asc" },
        with: { author: { columns: { id: true, name: true } } }
    });

    return c.json(comments);
});

tasksApp.post("/:id{[0-9]+}/comments", async (c) => {
    const user = c.var.user;
    const db = c.get("db");
    const taskId = Number(c.req.param("id"));

    const existingTask = await loadClubTask(db, taskId, user.club.id);
    if (!existingTask) throw new HTTPException(404, { message: "Task not found" });

    const body = await c.req.json();
    const parsed = CreateTaskCommentSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: describeZodError(parsed.error) });

    const [comment] = await db
        .insert(taskCommentsTable)
        .values({ taskId, authorId: user.id, body: parsed.data.body })
        .returning();

    if (!comment) throw new HTTPException(500, { message: "Failed to add comment" });

    return c.json({ ...comment, author: { id: user.id, name: user.name } }, 201);
});

tasksApp.put("/:id{[0-9]+}/comments/:commentId{[0-9]+}", async (c) => {
    const user = c.var.user;
    const db = c.get("db");
    const taskId = Number(c.req.param("id"));
    const commentId = Number(c.req.param("commentId"));

    const existingTask = await loadClubTask(db, taskId, user.club.id);
    if (!existingTask) throw new HTTPException(404, { message: "Task not found" });

    const existingComment = await loadTaskComment(db, taskId, commentId);
    if (!existingComment) throw new HTTPException(404, { message: "Comment not found" });
    if (existingComment.authorId !== user.id) throw new HTTPException(403, { message: "You can only edit your own comments" });

    const body = await c.req.json();
    const parsed = UpdateTaskCommentSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: describeZodError(parsed.error) });

    const [comment] = await db
        .update(taskCommentsTable)
        .set({ body: parsed.data.body, updatedAt: new Date() })
        .where(eq(taskCommentsTable.id, commentId))
        .returning();

    return c.json({ ...comment, author: { id: user.id, name: user.name } });
});

tasksApp.delete("/:id{[0-9]+}/comments/:commentId{[0-9]+}", async (c) => {
    const user = c.var.user;
    const db = c.get("db");
    const taskId = Number(c.req.param("id"));
    const commentId = Number(c.req.param("commentId"));

    const existingTask = await loadClubTask(db, taskId, user.club.id);
    if (!existingTask) throw new HTTPException(404, { message: "Task not found" });

    const existingComment = await loadTaskComment(db, taskId, commentId);
    if (!existingComment) throw new HTTPException(404, { message: "Comment not found" });

    const allowed = existingComment.authorId === user.id || isExecOrAdmin(user.role);
    if (!allowed) throw new HTTPException(403, { message: "Only the comment author, club admins, or execs can delete this comment" });

    await db.delete(taskCommentsTable).where(eq(taskCommentsTable.id, commentId));

    return c.json({ message: "Deleted" });
});

export { tasksApp };
