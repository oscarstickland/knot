import { Hono } from "hono";
import { hashPassword, isAuthenticated, type UserEnv } from "../services/auth";
import type { DbEnv } from "../db/connection";
import { HTTPException } from "hono/http-exception";
import { usersTable } from "../db/schema";
import { and, eq, getTableColumns, inArray, ne } from "drizzle-orm";
import { BulkDeleteSchema, BulkRoleUpdateSchema, CreateMemberSchema, UpdateMemberSchema } from "../types/user";

const userApp = new Hono<UserEnv & DbEnv>();
userApp.use("*", isAuthenticated);

userApp.get("/me", async (c) => {
    return c.json(c.var.user);
});

userApp.get("/", async (c) => {
    const user = c.var.user;
    if (user.role !== "admin" && user.role !== "exec") throw new HTTPException(403);

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
    if (admin.role !== "admin") throw new HTTPException(403);

    const db = c.get("db");
    const body = await c.req.json();

    const parsed = CreateMemberSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: "Invalid payload" });

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
    if (admin.role !== "admin") throw new HTTPException(403);

    const db = c.get("db");
    const body = await c.req.json();

    const parsed = BulkRoleUpdateSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: "Invalid payload" });

    const { password, ...columns } = getTableColumns(usersTable);
    const updatedMembers = await db
        .update(usersTable)
        .set({ role: parsed.data.role })
        .where(and(
            inArray(usersTable.id, parsed.data.ids),
            eq(usersTable.clubId, admin.club.id),
            ne(usersTable.role, "admin")
        ))
        .returning(columns);

    return c.json(updatedMembers);
});

userApp.post("/bulk-delete", async (c) => {
    const admin = c.var.user;
    if (admin.role !== "admin") throw new HTTPException(403);

    const db = c.get("db");
    const body = await c.req.json();

    const parsed = BulkDeleteSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: "Invalid payload" });

    const { password, ...columns } = getTableColumns(usersTable);
    const deletedMembers = await db
        .delete(usersTable)
        .where(and(
            inArray(usersTable.id, parsed.data.ids),
            eq(usersTable.clubId, admin.club.id),
            ne(usersTable.role, "admin")
        ))
        .returning(columns);

    return c.json(deletedMembers);
});

userApp.put("/:id{[0-9]+}", async (c) => {
    const admin = c.var.user;
    if (admin.role !== "admin") throw new HTTPException(403);

    const memberId = Number(c.req.param("id"));
    const db = c.get("db");
    const body = await c.req.json();

    const parsed = UpdateMemberSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: "Invalid payload" });

    const target = await db.query.usersTable.findFirst({
        where: { id: memberId, clubId: admin.club.id }
    });
    if (!target) throw new HTTPException(404, { message: "Member not found" });
    if (target.role === "admin") throw new HTTPException(400, { message: "Admin accounts cannot be edited here" });

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

userApp.delete("/:id{[0-9]+}", async (c) => {
    const admin = c.var.user;
    if (admin.role !== "admin") throw new HTTPException(403);

    const memberId = Number(c.req.param("id"));
    const db = c.get("db");

    const target = await db.query.usersTable.findFirst({
        where: { id: memberId, clubId: admin.club.id }
    });
    if (!target) throw new HTTPException(404, { message: "Member not found" });
    if (target.role === "admin") throw new HTTPException(400, { message: "Admin accounts cannot be deleted here" });

    await db
        .delete(usersTable)
        .where(and(eq(usersTable.id, memberId), eq(usersTable.clubId, admin.club.id)));

    return c.body(null, 204);
});

export { userApp };