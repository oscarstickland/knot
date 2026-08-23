import { createMiddleware } from "hono/factory";
import {JWTUserSchema, type CurrentUserSchema, type JWTUserData, type CurrentUserData} from "../types/auth";
import type z from "zod";
import * as argon2 from 'argon2';
import {DBConnection, type DbEnv} from "../db/connection";
import { HTTPException } from "hono/http-exception";
import { getCookie } from "hono/cookie";
import {relations, usersTable} from "../db/schema";
import { and, eq } from "drizzle-orm";
import { decode } from "hono/jwt";
import type {NodePgDatabase} from "drizzle-orm/node-postgres";

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

    const currentUserData = await fetchCurrentUserData(tokenData, db);
    c.set("user", currentUserData);

    await next();
});

export async function fetchCurrentUserData(tokenData: JWTUserData, db: NodePgDatabase<typeof relations>): Promise<CurrentUserData> {
    // Find user from database
    const user = await db.query.usersTable.findFirst({
        where: {
            id: tokenData.id, email: tokenData.email
        },
        with: {
            club: true
        }
    });

    if (!user) {
        console.error("Unable to find the user in the database");
        throw new HTTPException(401);
    }

    if (!user.club) {
        console.error("Unable to find associated club in the database for user");
        throw new HTTPException(401);
    }

    return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        club: {
            id: user.club.id,
            name: user.club.name
        }
    }
}

export async function hashPassword(password: string): Promise<string> {
    return await argon2.hash(password);
}

export async function verifyPassword(plainText: string, hash: string): Promise<boolean> {
    return await argon2.verify(hash, plainText);
}
