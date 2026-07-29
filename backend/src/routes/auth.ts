import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import type z from "zod";
import { sign } from "hono/jwt";
import { deleteCookie, setCookie } from "hono/cookie";

import { LoginFormSchema, type CurrentUserData } from "../types/auth";
import { type DbEnv } from "../db/connection";
import { usersTable } from "../db/schema";
import { AUTH_COOKIE_NAME, JWT_SECRET, verifyPassword } from "../services/auth";
import { JWTUserSchema } from "../types/auth";

const authApp = new Hono<DbEnv>();

authApp.post("/login", zValidator("json", LoginFormSchema), async (c) => {
    const db = c.get("db");
    const data = c.req.valid('json');

    // Fetch user
    const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, data.email))
        .limit(1);
    if (!user) return c.json({ message: "Incorrect email or password" }, 401);

    // Check password
    if (!(await verifyPassword(data.password, user.password))) 
        return c.json({ message: "Incorrect email or password" }, 401);

    // Create JWT
    const tokenData: z.infer<typeof JWTUserSchema> = {
        id: user.id,
        email: user.email
    };
    const token = await sign({data: JSON.stringify(tokenData)}, JWT_SECRET);
    
    // Set Cookie
    setCookie(c, AUTH_COOKIE_NAME, token, {
        path: "/",
        secure: true,
        httpOnly: true
    });

    const response: CurrentUserData = {
        id: user.id,
        name: user.name,
        email: user.email
    }

    return c.json(response, 200);
});

authApp.post("/logout", async (c) => {
    // Simply - clear the cookies
    deleteCookie(c, AUTH_COOKIE_NAME);
    return c.body(null, 200);
})

export { authApp };