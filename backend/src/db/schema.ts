import { defineRelations } from "drizzle-orm";
import {boolean, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, varchar} from "drizzle-orm/pg-core";

export const userRoles = ["standard", "exec", "admin"] as const;
export const rolesEnum = pgEnum("roles", userRoles);

export const taskPriorities = ["low", "medium", "high"] as const;
export const taskPriorityEnum = pgEnum("task_priority", taskPriorities);

export const taskProgressStates = ["backlog", "in_progress", "in_review", "completed"] as const;
export const taskProgressEnum = pgEnum("task_progress", taskProgressStates);

export const taskAuditActions = ["created", "updated"] as const;
export const taskAuditActionEnum = pgEnum("task_audit_action", taskAuditActions);

export const clubsTable = pgTable("clubs", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: varchar({ length: 255 }).notNull()
});

export const usersTable = pgTable("users", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: varchar({ length: 255 }).notNull(),
    email: varchar({ length: 255 }).notNull().unique(),
    password: varchar({ length: 500 }).notNull(),
    role: rolesEnum().default("standard").notNull(),
    clubId: integer("club_id").notNull(),
});

export const eventsTable = pgTable("events", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: varchar({ length: 255 }).notNull(),
    start: timestamp("start_time", { mode: "date", withTimezone: true }).notNull(),
    end: timestamp("end_time", { mode: "date", withTimezone: true }).notNull(),
    clubId: integer("club_id").notNull(),
    archived: boolean("archived").default(false).notNull(),
});

export const tasksTable = pgTable("tasks", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    eventId: integer("event_id").notNull(),
    title: varchar({ length: 255 }).notNull(),
    description: text("description").notNull(),
    priority: taskPriorityEnum().default("medium").notNull(),
    progress: taskProgressEnum().default("backlog").notNull(),
    dueDate: timestamp("due_date", { mode: "date", withTimezone: true }),
    createdBy: integer("created_by").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
});

export const taskAssignmentsTable = pgTable("task_assignments", {
    taskId: integer("task_id").notNull(),
    userId: integer("user_id").notNull(),
}, (table) => [
    primaryKey({ columns: [table.taskId, table.userId] })
]);

export const taskDependenciesTable = pgTable("task_dependencies", {
    taskId: integer("task_id").notNull(),
    dependsOnTaskId: integer("depends_on_task_id").notNull(),
}, (table) => [
    primaryKey({ columns: [table.taskId, table.dependsOnTaskId] })
]);

export const taskDocumentsTable = pgTable("task_documents", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    taskId: integer("task_id").notNull(),
    url: varchar({ length: 2048 }).notNull(),
    addedBy: integer("added_by").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
});

// Insert-only audit log. No route should ever update or delete a row here.
export const taskAuditLogTable = pgTable("task_audit_log", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    taskId: integer("task_id").notNull(),
    changedBy: integer("changed_by").notNull(),
    action: taskAuditActionEnum().notNull(),
    changes: jsonb("changes").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
});

export const relations = defineRelations({
    clubsTable,
    usersTable,
    eventsTable,
    tasksTable,
    taskAssignmentsTable,
    taskDependenciesTable,
    taskDocumentsTable,
    taskAuditLogTable
}, (r) => ({
    usersTable: {
        club: r.one.clubsTable({
            from: r.usersTable.clubId,
            to: r.clubsTable.id
        })
    },
    eventsTable: {
        club: r.one.clubsTable({
            from: r.eventsTable.clubId,
            to: r.clubsTable.id
        })
    },
    clubsTable: {
        users: r.many.usersTable(),
        events: r.many.eventsTable()
    },
    tasksTable: {
        event: r.one.eventsTable({
            from: r.tasksTable.eventId,
            to: r.eventsTable.id
        }),
        creator: r.one.usersTable({
            from: r.tasksTable.createdBy,
            to: r.usersTable.id
        }),
        assignments: r.many.taskAssignmentsTable(),
        documents: r.many.taskDocumentsTable(),
        auditLog: r.many.taskAuditLogTable(),
        dependsOn: r.many.taskDependenciesTable({
            from: r.tasksTable.id,
            to: r.taskDependenciesTable.taskId
        }),
        dependents: r.many.taskDependenciesTable({
            from: r.tasksTable.id,
            to: r.taskDependenciesTable.dependsOnTaskId
        })
    },
    taskAssignmentsTable: {
        task: r.one.tasksTable({
            from: r.taskAssignmentsTable.taskId,
            to: r.tasksTable.id
        }),
        user: r.one.usersTable({
            from: r.taskAssignmentsTable.userId,
            to: r.usersTable.id
        })
    },
    taskDependenciesTable: {
        task: r.one.tasksTable({
            from: r.taskDependenciesTable.taskId,
            to: r.tasksTable.id
        }),
        dependsOnTask: r.one.tasksTable({
            from: r.taskDependenciesTable.dependsOnTaskId,
            to: r.tasksTable.id
        })
    },
    taskDocumentsTable: {
        task: r.one.tasksTable({
            from: r.taskDocumentsTable.taskId,
            to: r.tasksTable.id
        }),
        addedByUser: r.one.usersTable({
            from: r.taskDocumentsTable.addedBy,
            to: r.usersTable.id
        })
    },
    taskAuditLogTable: {
        task: r.one.tasksTable({
            from: r.taskAuditLogTable.taskId,
            to: r.tasksTable.id
        }),
        changedByUser: r.one.usersTable({
            from: r.taskAuditLogTable.changedBy,
            to: r.usersTable.id
        })
    }
}));