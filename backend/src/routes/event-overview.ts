import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, count, desc, eq, max, min, sql } from "drizzle-orm";
import { isAuthenticated, type UserEnv } from "../services/auth.ts";
import type { DbEnv } from "../db/connection.ts";
import {
    eventAttendanceTable,
    eventDocumentsTable,
    taskAuditLogTable,
    taskCommentsTable,
    tasksTable,
    usersTable
} from "../db/schema.ts";
import {
    ACTIVITY_LIMIT,
    auditEntryToActivity,
    getEventPhase,
    mergeActivity,
    summariseBudget,
    summariseTasks,
    type OverviewTaskInput
} from "../services/event-overview.ts";
import type { EventOverview, OverviewActivity, OverviewBudget } from "../types/event-overview.ts";

type Db = DbEnv["Variables"]["db"];

const RECENT_DOCUMENT_LIMIT = 4;

function isExecOrAdmin(role: string): boolean {
    return role === "exec" || role === "admin";
}

async function loadTasks(db: Db, eventId: number): Promise<OverviewTaskInput[]> {
    const [tasks, completions] = await Promise.all([
        db.query.tasksTable.findMany({
            where: { eventId },
            with: {
                assignments: { with: { user: { columns: { id: true, name: true } } } },
                dependsOn: true
            },
            orderBy: { id: "asc" }
        }),
        db
            .select({ taskId: taskAuditLogTable.taskId, completedAt: max(taskAuditLogTable.createdAt) })
            .from(taskAuditLogTable)
            .innerJoin(tasksTable, eq(tasksTable.id, taskAuditLogTable.taskId))
            .where(and(
                eq(tasksTable.eventId, eventId),
                sql`${taskAuditLogTable.changes}->>'progress' = 'completed'`
            ))
            .groupBy(taskAuditLogTable.taskId)
    ]);

    const completedAtByTask = new Map(completions.map((row) => [row.taskId, row.completedAt]));
    return tasks.map((task) => ({
        id: task.id,
        title: task.title,
        progress: task.progress,
        dueDate: task.dueDate,
        assignees: task.assignments.flatMap((assignment) => assignment.user ? [assignment.user] : []),
        prerequisiteIds: task.dependsOn.map((dependency) => dependency.dependsOnTaskId),
        completedAt: completedAtByTask.get(task.id) ?? null
    }));
}

async function loadAttendance(db: Db, eventId: number, expected: number | null) {
    const [row] = await db
        .select({
            checkedIn: count(),
            firstCheckIn: min(eventAttendanceTable.createdAt),
            lastCheckIn: max(eventAttendanceTable.createdAt)
        })
        .from(eventAttendanceTable)
        .where(eq(eventAttendanceTable.eventId, eventId));

    return {
        checkedIn: row?.checkedIn ?? 0,
        expected,
        firstCheckIn: row?.firstCheckIn ?? null,
        lastCheckIn: row?.lastCheckIn ?? null
    };
}

async function loadDocuments(db: Db, eventId: number) {
    const [[totals], documents] = await Promise.all([
        db.select({ total: count() }).from(eventDocumentsTable).where(eq(eventDocumentsTable.eventId, eventId)),
        db.query.eventDocumentsTable.findMany({
            where: { eventId },
            with: { addedByUser: { columns: { name: true } } },
            orderBy: { createdAt: "desc", id: "desc" },
            limit: ACTIVITY_LIMIT
        })
    ]);

    return {
        documents: {
            total: totals?.total ?? 0,
            recent: documents.slice(0, RECENT_DOCUMENT_LIMIT).map((document) => ({
                id: document.id,
                title: document.title,
                url: document.url,
                addedBy: document.addedByUser?.name ?? "Unknown",
                createdAt: document.createdAt
            }))
        },
        activity: documents.map((document): OverviewActivity => ({
            key: `document-${document.id}`,
            kind: "document",
            actorName: document.addedByUser?.name ?? null,
            subject: document.title,
            amount: null,
            progress: null,
            at: document.createdAt
        }))
    };
}

async function loadTaskActivity(db: Db, eventId: number): Promise<OverviewActivity[]> {
    const [auditRows, commentRows] = await Promise.all([
        db
            .select({
                id: taskAuditLogTable.id,
                action: taskAuditLogTable.action,
                changes: taskAuditLogTable.changes,
                createdAt: taskAuditLogTable.createdAt,
                taskTitle: tasksTable.title,
                actorName: usersTable.name
            })
            .from(taskAuditLogTable)
            .innerJoin(tasksTable, eq(tasksTable.id, taskAuditLogTable.taskId))
            .leftJoin(usersTable, eq(usersTable.id, taskAuditLogTable.changedBy))
            .where(eq(tasksTable.eventId, eventId))
            .orderBy(desc(taskAuditLogTable.createdAt), desc(taskAuditLogTable.id))
            .limit(ACTIVITY_LIMIT),
        db
            .select({
                id: taskCommentsTable.id,
                createdAt: taskCommentsTable.createdAt,
                taskTitle: tasksTable.title,
                actorName: usersTable.name
            })
            .from(taskCommentsTable)
            .innerJoin(tasksTable, eq(tasksTable.id, taskCommentsTable.taskId))
            .leftJoin(usersTable, eq(usersTable.id, taskCommentsTable.authorId))
            .where(eq(tasksTable.eventId, eventId))
            .orderBy(desc(taskCommentsTable.createdAt), desc(taskCommentsTable.id))
            .limit(ACTIVITY_LIMIT)
    ]);

    return [
        ...auditRows.map((row) => auditEntryToActivity(row)),
        ...commentRows.map((row): OverviewActivity => ({
            key: `comment-${row.id}`,
            kind: "comment",
            actorName: row.actorName,
            subject: row.taskTitle,
            amount: null,
            progress: null,
            at: row.createdAt
        }))
    ];
}

async function loadMoney(db: Db, eventId: number): Promise<{ budget: OverviewBudget; activity: OverviewActivity[] }> {
    const [categories, expenses, income] = await Promise.all([
        db.query.budgetCategoriesTable.findMany({ where: { eventId } }),
        db.query.expensesTable.findMany({
            where: { eventId },
            with: { category: true, creator: { columns: { name: true } } },
            orderBy: { createdAt: "desc", id: "desc" }
        }),
        db.query.incomeTable.findMany({
            where: { eventId },
            with: { creator: { columns: { name: true } } },
            orderBy: { createdAt: "desc", id: "desc" }
        })
    ]);

    const budget = summariseBudget({
        totalAllocated: categories.reduce((sum, category) => sum + category.allocatedAmount, 0),
        expenses: expenses.map((expense) => ({
            amount: expense.amount,
            categoryName: expense.category?.name ?? "Uncategorised",
            paidPersonally: expense.paidPersonally,
            reimbursedAt: expense.reimbursedAt
        })),
        income: income.map((entry) => ({ amount: entry.amount, source: entry.source }))
    });

    const activity: OverviewActivity[] = [
        ...expenses.slice(0, ACTIVITY_LIMIT).map((expense): OverviewActivity => ({
            key: `expense-${expense.id}`,
            kind: "expense",
            actorName: expense.creator?.name ?? null,
            subject: expense.category?.name ?? "Uncategorised",
            amount: expense.amount,
            progress: null,
            at: expense.createdAt
        })),
        ...income.slice(0, ACTIVITY_LIMIT).map((entry): OverviewActivity => ({
            key: `income-${entry.id}`,
            kind: "income",
            actorName: entry.creator?.name ?? null,
            subject: entry.source,
            amount: entry.amount,
            progress: null,
            at: entry.createdAt
        }))
    ];

    return { budget, activity };
}

const eventOverviewApp = new Hono<UserEnv & DbEnv>();
eventOverviewApp.use("*", isAuthenticated);

// One round trip for the whole Overview tab. Club-wide money (budget totals, expense and
// income activity) is only included for execs and admins, matching the Budget tab.
eventOverviewApp.get("/:id{[0-9]+}/overview", async (c) => {
    const eventId = Number(c.req.param("id"));
    const db = c.get("db");
    const user = c.var.user;
    const canSeeMoney = isExecOrAdmin(user.role);

    const event = await db.query.eventsTable.findFirst({
        where: { id: eventId, clubId: user.club.id }
    });
    if (!event) throw new HTTPException(404, { message: "Event not found" });
    if (event.archived && !canSeeMoney) throw new HTTPException(404, { message: "Event not found" });

    const now = new Date();
    const [tasks, attendance, documentData, taskActivity, money] = await Promise.all([
        loadTasks(db, eventId),
        loadAttendance(db, eventId, event.expectedAttendees),
        loadDocuments(db, eventId),
        loadTaskActivity(db, eventId),
        canSeeMoney ? loadMoney(db, eventId) : Promise.resolve(null)
    ]);

    const overview: EventOverview = {
        phase: getEventPhase(event, now),
        tasks: summariseTasks(tasks, now),
        attendance,
        documents: documentData.documents,
        activity: mergeActivity([taskActivity, documentData.activity, money?.activity ?? []]),
        budget: money?.budget ?? null
    };

    return c.json(overview);
});

export { eventOverviewApp };
