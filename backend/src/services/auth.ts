import { createMiddleware } from "hono/factory";
import {JWTUserSchema, type CurrentUserSchema, type JWTUserData, type CurrentUserData, type SessionUserData, type SuperAdminUserData} from "../types/auth";
import type z from "zod";
import * as argon2 from 'argon2';
import {DBConnection, type DbEnv} from "../db/connection";
import type { Context } from "hono";
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

export type SuperAdminEnv = {
    Variables: {
        superAdmin: SuperAdminUserData
    }
}

// Resolves the session user from the auth cookie. Throws 401 when missing or invalid.
async function authenticate(c: Context, db: NodePgDatabase<typeof relations>): Promise<SessionUserData> {

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
    return fetchSessionUserData(result.data, db);
}

// Club app routes. Super admins have no club, so they are kept out of everything behind this.
export const isAuthenticated = createMiddleware<UserEnv & DbEnv>(async (c, next) => {
    const session = await authenticate(c, c.get("db"));
    if (session.role === "superadmin") throw new HTTPException(403, { message: "Super admins cannot use the club app" });

    c.set("user", session);
    await next();
});

// Any logged in user, club member or super admin. Only for endpoints like /user/me.
export const isAuthenticatedAny = createMiddleware<{ Variables: { session: SessionUserData } } & DbEnv>(async (c, next) => {
    c.set("session", await authenticate(c, c.get("db")));
    await next();
});

export const isSuperAdmin = createMiddleware<SuperAdminEnv & DbEnv>(async (c, next) => {
    const session = await authenticate(c, c.get("db"));
    if (session.role !== "superadmin") throw new HTTPException(403, { message: "Super admin access required" });

    c.set("superAdmin", session);
    await next();
});

export async function fetchSessionUserData(tokenData: JWTUserData, db: NodePgDatabase<typeof relations>): Promise<SessionUserData> {
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

    if (user.status === "offboarded") {
        throw new HTTPException(401);
    }

    if (user.role === "superadmin") {
        return { id: user.id, name: user.name, email: user.email, role: "superadmin", club: null };
    }

    if (!user.club) {
        console.error("Unable to find associated club in the database for user");
        throw new HTTPException(401);
    }

    if (user.club.archivedAt) {
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
