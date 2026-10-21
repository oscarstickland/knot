import type { DbEnv } from "../db/connection";
import {
    budgetCategoriesTable,
    clubsTable,
    eventAttendanceTable,
    eventDocumentsTable,
    eventsTable,
    expensesTable,
    incomeTable,
    taskAssignmentsTable,
    taskAuditLogTable,
    taskCommentsTable,
    taskDependenciesTable,
    taskDocumentsTable,
    tasksTable,
    usersTable
} from "../db/schema";
import { eq, inArray, or } from "drizzle-orm";

type Db = DbEnv["Variables"]["db"];

// The schema has no foreign keys, so a club's data has to be removed table by table.
export async function deleteClubPermanently(db: Db, clubId: number): Promise<void> {
    await db.transaction(async (tx) => {
        const eventIds = tx.select({ id: eventsTable.id }).from(eventsTable).where(eq(eventsTable.clubId, clubId));
        const taskIds = tx.select({ id: tasksTable.id }).from(tasksTable).where(inArray(tasksTable.eventId, eventIds));

        await tx.delete(taskCommentsTable).where(inArray(taskCommentsTable.taskId, taskIds));
        await tx.delete(taskAuditLogTable).where(inArray(taskAuditLogTable.taskId, taskIds));
        await tx.delete(taskDocumentsTable).where(inArray(taskDocumentsTable.taskId, taskIds));
        await tx.delete(taskAssignmentsTable).where(inArray(taskAssignmentsTable.taskId, taskIds));
        await tx.delete(taskDependenciesTable).where(or(
            inArray(taskDependenciesTable.taskId, taskIds),
            inArray(taskDependenciesTable.dependsOnTaskId, taskIds)
        ));
        await tx.delete(tasksTable).where(inArray(tasksTable.eventId, eventIds));

        await tx.delete(eventAttendanceTable).where(inArray(eventAttendanceTable.eventId, eventIds));
        await tx.delete(expensesTable).where(inArray(expensesTable.eventId, eventIds));
        await tx.delete(budgetCategoriesTable).where(inArray(budgetCategoriesTable.eventId, eventIds));
        await tx.delete(incomeTable).where(inArray(incomeTable.eventId, eventIds));
        await tx.delete(eventDocumentsTable).where(inArray(eventDocumentsTable.eventId, eventIds));
        await tx.delete(eventsTable).where(eq(eventsTable.clubId, clubId));

        await tx.delete(usersTable).where(eq(usersTable.clubId, clubId));
        await tx.delete(clubsTable).where(eq(clubsTable.id, clubId));
    });
}
