import { Hono } from "hono";
import { hashPassword, isAuthenticated, type UserEnv } from "../services/auth";
import type { DbEnv } from "../db/connection";
import { HTTPException } from "hono/http-exception";
import { eventsTable, taskAssignmentsTable, taskAuditLogTable, tasksTable, usersTable } from "../db/schema";
import { and, eq, getTableColumns, inArray, ne } from "drizzle-orm";
import { describeZodError } from "../types/errors";
import {
    BulkOffboardSchema,
    BulkRoleUpdateSchema,
    CreateMemberSchema,
    UpdateMemberSchema,
    type OffboardedTask
} from "../types/user";

type Db = DbEnv["Variables"]["db"];

const userApp = new Hono<UserEnv & DbEnv>();
userApp.use("*", isAuthenticated);

// Unassigns the given members from any tasks in this club, logging the change
// against each affected task, then marks the members as offboarded. Returns the
// tasks each member was unassigned from so callers can surface a "needs a new
// owner" notice.
async function offboardMembers(
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

userApp.get("/me", async (c) => {
    return c.json(c.var.user);
});

userApp.get("/", async (c) => {
    const user = c.var.user;
    if (user.role !== "admin" && user.role !== "exec") throw new HTTPException(403, { message: "Only admins and execs can view the member list" });

    const db = c.get("db");
    const { password, ...columns } = getTableColumns(usersTable);

    const members = await db
        .select(columns)
        .from(usersTable)
        .where(eq(usersTable.clubId, user.club.id));

    return c.json(members);
});

userApp.post("/", async (c) => {
    const admin = c.var.user;
    if (admin.role !== "admin") throw new HTTPException(403, { message: "Only admins can create members" });

    const db = c.get("db");
    const body = await c.req.json();

    const parsed = CreateMemberSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: describeZodError(parsed.error) });

    const emailInUse = await db.query.usersTable.findFirst({
        where: { email: parsed.data.email }
    });
    if (emailInUse) throw new HTTPException(400, { message: "Email is already in use" });

    const { password, ...columns } = getTableColumns(usersTable);
    const [newMember] = await db
        .insert(usersTable)
        .values({
            name: parsed.data.name,
            email: parsed.data.email,
            role: parsed.data.role,
            password: await hashPassword(parsed.data.password),
            clubId: admin.club.id
        })
        .returning(columns);

    return c.json(newMember, 201);
});

userApp.patch("/bulk-role", async (c) => {
    const admin = c.var.user;
    if (admin.role !== "admin") throw new HTTPException(403, { message: "Only admins can change member roles" });

    const db = c.get("db");
    const body = await c.req.json();

    const parsed = BulkRoleUpdateSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: describeZodError(parsed.error) });

    const { password, ...columns } = getTableColumns(usersTable);
    const updatedMembers = await db
        .update(usersTable)
        .set({ role: parsed.data.role })
        .where(and(
            inArray(usersTable.id, parsed.data.ids),
            eq(usersTable.clubId, admin.club.id),
            ne(usersTable.role, "admin"),
            ne(usersTable.status, "offboarded")
        ))
        .returning(columns);

    return c.json(updatedMembers);
});

userApp.post("/bulk-offboard", async (c) => {
    const admin = c.var.user;
    if (admin.role !== "admin") throw new HTTPException(403, { message: "Only admins can delete members" });

    const db = c.get("db");
    const body = await c.req.json();

    const parsed = BulkOffboardSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: describeZodError(parsed.error) });

    const { password, ...columns } = getTableColumns(usersTable);
    const targets = await db
        .select(columns)
        .from(usersTable)
        .where(and(
            inArray(usersTable.id, parsed.data.ids),
            eq(usersTable.clubId, admin.club.id),
            ne(usersTable.role, "admin"),
            ne(usersTable.status, "offboarded")
        ));

    if (targets.length === 0) return c.json({ members: [], unassignedTasks: [] });

    const unassignedTasksByMember = await offboardMembers(
        db,
        targets.map((t) => t.id),
        admin.club.id,
        admin.id
    );

    const members = targets.map((t) => ({ ...t, status: "offboarded" as const }));
    const unassignedTasks = [...unassignedTasksByMember.values()].flat();

    return c.json({ members, unassignedTasks });
});

userApp.put("/:id{[0-9]+}", async (c) => {
    const admin = c.var.user;
    if (admin.role !== "admin") throw new HTTPException(403, { message: "Only admins can edit members" });

    const memberId = Number(c.req.param("id"));
    const db = c.get("db");
    const body = await c.req.json();

    const parsed = UpdateMemberSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: describeZodError(parsed.error) });

    const target = await db.query.usersTable.findFirst({
        where: { id: memberId, clubId: admin.club.id }
    });
    if (!target) throw new HTTPException(404, { message: "Member not found" });
    if (target.role === "admin") throw new HTTPException(400, { message: "Admin accounts cannot be edited here" });
    if (target.status === "offboarded") throw new HTTPException(400, { message: "Offboarded members cannot be edited" });

    const emailInUse = await db.query.usersTable.findFirst({
        where: { email: parsed.data.email, id: { ne: memberId } }
    });
    if (emailInUse) throw new HTTPException(400, { message: "Email is already in use" });

    const { password, ...columns } = getTableColumns(usersTable);
    const [updatedMember] = await db
        .update(usersTable)
        .set({
            name: parsed.data.name,
            email: parsed.data.email,
            role: parsed.data.role,
            ...(parsed.data.password ? { password: await hashPassword(parsed.data.password) } : {})
        })
        .where(and(eq(usersTable.id, memberId), eq(usersTable.clubId, admin.club.id)))
        .returning(columns);

    return c.json(updatedMember);
});

userApp.post("/:id{[0-9]+}/offboard", async (c) => {
    const admin = c.var.user;
    if (admin.role !== "admin") throw new HTTPException(403, { message: "Only admins can delete members" });

    const memberId = Number(c.req.param("id"));
    const db = c.get("db");

    const target = await db.query.usersTable.findFirst({
        where: { id: memberId, clubId: admin.club.id }
    });
    if (!target) throw new HTTPException(404, { message: "Member not found" });
    if (target.role === "admin") throw new HTTPException(400, { message: "Admin accounts cannot be offboarded here" });
    if (target.status === "offboarded") throw new HTTPException(400, { message: "Member is already offboarded" });

    const unassignedTasksByMember = await offboardMembers(db, [memberId], admin.club.id, admin.id);

    const { password, ...member } = target;
    return c.json({
        member: { ...member, status: "offboarded" as const },
        unassignedTasks: unassignedTasksByMember.get(memberId) ?? []
    });
});

export { userApp };