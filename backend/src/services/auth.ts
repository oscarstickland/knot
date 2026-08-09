import { createMiddleware } from "hono/factory";
import { JWTUserSchema, type CurrentUserSchema } from "../types/auth";
import type z from "zod";
import * as argon2 from 'argon2';
import type { DbEnv } from "../db/connection";
import { HTTPException } from "hono/http-exception";
import { getCookie } from "hono/cookie";
import { usersTable } from "../db/schema";
import { and, eq } from "drizzle-orm";
import { decode } from "hono/jwt";

export const AUTH_COOKIE_NAME = "KnotAuth";
export const JWT_SECRET = process.env.JWT_SECRET!;

export type UserEnv = {
    Variables: {
        user: z.infer<typeof CurrentUserSchema>
    }
}

export const isAuthenticated = createMiddleware<UserEnv & DbEnv>(async (c, next) => {
    const db = c.get("db");

    // Retrieve cookie
    const jwt = getCookie(c, AUTH_COOKIE_NAME);
    if (!jwt) throw new HTTPException(401);

    // Decode token and parse JSON
    const token = await decode(jwt);
    let payload;

    try {
        if (!token.payload.data) throw new HTTPException(401);
        payload = JSON.parse(token.payload.data as string);
    } catch {
        console.error("Unable to parse the JSON data in JWT cookie.")
        throw new HTTPException(401);
    }

    const result = JWTUserSchema.safeParse(payload);
    if (!result.success) {
        console.log(result.error);
        console.error("Unable to decode the provided JWT with the correct schema");
        throw new HTTPException(401);
    }
    const tokenData = result.data;

    // Find user from database
    const [user] = await db
        .select()
        .from(usersTable)
        .where(and(eq(usersTable.id, tokenData.id), eq(usersTable.email, tokenData.email)))
        .limit(1);

    if (!user) {
        console.error("Unable to find the user in the database");
        throw new HTTPException(401);
    }

    // Set the user on the request so the route can access it
    c.set("user", {id: user.id, name: user.name, email: user.email, role: user.role})

    await next();
});

export async function hashPassword(password: string): Promise<string> {
    return await argon2.hash(password);
}

export async function verifyPassword(plainText: string, hash: string): Promise<boolean> {
    return await argon2.verify(hash, plainText);
}
