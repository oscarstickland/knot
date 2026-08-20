import type { tasksTable, taskAuditLogTable, taskDocumentsTable, taskAssignmentsTable, taskDependenciesTable } from "../db/schema.ts";
import { taskPriorities, taskProgressStates } from "../db/schema.ts";
import { z } from "zod";

export { taskPriorities, taskProgressStates };

const TaskSchema = z.object({
    eventId: z.number().int().positive(),
    title: z.string().min(1, "Task title cannot be empty"),
    description: z.string().min(1, "Task description cannot be empty"),
    priority: z.enum(taskPriorities),
    dueDate: z.string().datetime({ offset: true }).pipe(z.coerce.date()).nullable().optional(),
    assigneeIds: z.array(z.number().int().positive()),
    dependencyIds: z.array(z.number().int().positive())
});

export const CreateTaskSchema = TaskSchema;
export const UpdateTaskSchema = TaskSchema;

export const UpdateTaskProgressSchema = z.object({
    progress: z.enum(taskProgressStates)
});

export const AddTaskDocumentSchema = z.object({
    url: z.string().url()
});

export type CreateTaskData = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskData = z.infer<typeof UpdateTaskSchema>;
export type UpdateTaskProgressData = z.infer<typeof UpdateTaskProgressSchema>;
export type AddTaskDocumentData = z.infer<typeof AddTaskDocumentSchema>;

export type Task = typeof tasksTable.$inferSelect;
export type TaskDocument = typeof taskDocumentsTable.$inferSelect;
export type TaskAuditLogEntry = typeof taskAuditLogTable.$inferSelect;
export type TaskAssignment = typeof taskAssignmentsTable.$inferSelect;
export type TaskDependency = typeof taskDependenciesTable.$inferSelect;

export type TaskWithRelations = Task & {
    assignments: TaskAssignment[];
    dependsOn: TaskDependency[];
    documents: TaskDocument[];
};

export type TaskDetail = TaskWithRelations & {
    auditLog: TaskAuditLogEntry[];
};
