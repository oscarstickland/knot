import type { DbEnv } from "../db/connection";
import { eventsTable, taskAssignmentsTable, taskAuditLogTable, tasksTable, usersTable } from "../db/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { OffboardedTask } from "../types/user";

type Db = DbEnv["Variables"]["db"];

// Unassigns the given members from any tasks in this club, logging the change
// against each affected task, then marks the members as offboarded. Returns the
// tasks each member was unassigned from so callers can surface a "needs a new
// owner" notice.
export async function offboardMembers(
    db: Db,
    memberIds: number[],
    clubId: number,
    changedBy: number
): Promise<Map<number, OffboardedTask[]>> {
    return db.transaction(async (tx) => {
        const affectedAssignments = await tx
            .select({
                taskId: taskAssignmentsTable.taskId,
                userId: taskAssignmentsTable.userId,
                title: tasksTable.title
            })
            .from(taskAssignmentsTable)
            .innerJoin(tasksTable, eq(tasksTable.id, taskAssignmentsTable.taskId))
            .innerJoin(eventsTable, eq(eventsTable.id, tasksTable.eventId))
            .where(and(
                inArray(taskAssignmentsTable.userId, memberIds),
                eq(eventsTable.clubId, clubId)
            ));

        if (affectedAssignments.length > 0) {
            const affectedTaskIds = [...new Set(affectedAssignments.map((a) => a.taskId))];

            await tx.delete(taskAssignmentsTable).where(and(
                inArray(taskAssignmentsTable.userId, memberIds),
                inArray(taskAssignmentsTable.taskId, affectedTaskIds)
            ));

            await tx.insert(taskAuditLogTable).values(
                affectedAssignments.map((assignment) => ({
                    taskId: assignment.taskId,
                    changedBy,
                    action: "updated" as const,
                    changes: { unassignedMember: assignment.userId, reason: "offboarded" }
                }))
            );
        }

        await tx
            .update(usersTable)
            .set({ status: "offboarded" })
            .where(and(inArray(usersTable.id, memberIds), eq(usersTable.clubId, clubId)));

        const unassignedTasksByMember = new Map<number, OffboardedTask[]>();
        for (const assignment of affectedAssignments) {
            const tasks = unassignedTasksByMember.get(assignment.userId) ?? [];
            tasks.push({ id: assignment.taskId, title: assignment.title });
            unassignedTasksByMember.set(assignment.userId, tasks);
        }

        return unassignedTasksByMember;
    });
}
