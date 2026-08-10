import { Hono } from "hono";
import { isAuthenticated, type UserEnv } from "../services/auth";
import type { DbEnv } from "../db/connection";
import { HTTPException } from "hono/http-exception";
import { usersTable } from "../db/schema";
import { eq, getTableColumns } from "drizzle-orm";

const userApp = new Hono<UserEnv & DbEnv>();
userApp.use("*", isAuthenticated);

userApp.get("/me", async (c) => {
    return c.json(c.var.user);
});

userApp.get("/", async (c) => {
    const user = c.var.user;
    if (user.role !== "admin") throw new HTTPException(403);

    const db = c.get("db");
    const { password, ...columns } = getTableColumns(usersTable);

    const members = await db
        .select(columns)
        .from(usersTable)
        .where(eq(usersTable.clubId, user.club.id));

    return c.json(members);
});

export { userApp };