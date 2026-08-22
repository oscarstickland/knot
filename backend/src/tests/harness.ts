import {drizzle, NodePgDatabase} from "drizzle-orm/node-postgres";
import { clubsTable, relations, type UserRole, usersTable } from "../db/schema.ts";
import {PostgreSqlContainer, type StartedPostgreSqlContainer} from "@testcontainers/postgresql";
import {Pool} from "pg";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import {sql} from "drizzle-orm";
import {createMiddleware} from "hono/factory";
import type {DbEnv} from "../db/connection.ts";
import {createApp} from "../index.ts";
import { z } from "zod";
import { JWTUserSchema } from "../types/auth.ts";
import { sign } from "hono/jwt";
import { AUTH_COOKIE_NAME, JWT_SECRET } from "../services/auth.ts";

export interface TestDatabaseHarness {
    db: NodePgDatabase<typeof relations>;
    container: StartedPostgreSqlContainer;
    close: () => Promise<void>;
    startTransaction: () => Promise<void>;
    rollbackTransaction: () => Promise<void>;

    setupApp: () => Promise<ReturnType<typeof createApp>>,
    setupClub: (name: string) => ReturnType<typeof setupClub>,
    setupUser: (email: string, role: UserRole, club: number, name: string) => ReturnType<typeof setupUser>
}

/**
 * Uses Docker (with @testcontainers) to spawn an active Postgres database instance.
 *
 * Will then apply the migrations to the table so that it contains the up-to-date schema.
 */
export async function setupHarness(): Promise<TestDatabaseHarness> {
    console.log("[Debug] [Harness] Starting Harness Setup");

    const container = await new PostgreSqlContainer("postgres:16-alpine")
        .withStartupTimeout(120000)
        .start();

    console.log("[Debug] [Harness] Starting Migrations");

    const pool = new Pool({ connectionString: container.getConnectionUri() });
    const client = await pool.connect();
    const db = drizzle({ client, relations: relations });

    await migrate(db, {
        migrationsFolder: path.resolve(__dirname, "../../drizzle"),
    });

    return {
        db,
        container,
        close: async () => {
            await client.end();
            await container.stop();
        },
        startTransaction: async () => {
            await db.execute(sql`BEGIN;`);
        },
        rollbackTransaction: async () => {
            await db.execute(sql`ROLLBACK;`);
        },
        setupApp: () => setupApp(db),
        setupClub: (name: string) => setupClub(db, name),
        setupUser: (email: string, role: UserRole, club: number, name: string = "User") => setupUser(db, email, role, club, name),
    }
}

/**
 * Returns a copy of the main application, injecting the instance of the provided database
 * @param db
 */
async function setupApp(db: TestDatabaseHarness["db"]) {
    // Create the db middleware
    const dbMiddleware = createMiddleware<DbEnv>(async (c, next) => {
        c.set("db", db);
        await next();
    });

    return createApp(dbMiddleware);
}

/**
 * Creates a club within the provided test harness
 * @param db Database test harness
 * @param name Optional, name of club, defaults to Club
 */
async function setupClub(db: TestDatabaseHarness["db"], name: string = "Club") {
    const [club] = await db.insert(clubsTable).values({
        name: name,
    }).returning();
    if (!club) throw new Error("Club returned is null");

    return club;
}

/**
 * Creates a user within the provided test harness. Will return the user and the JWT cookie.
 * @param db Database test harness
 * @param email Email
 * @param role Role
 * @param club Club Id
 * @param name Optional, name of user, defaults to User
 */
async function setupUser(db: TestDatabaseHarness["db"], email: string, role: UserRole, club: number, name: string = "User") {
    const [user] = await db.insert(usersTable).values({
        email: email, password: "_", name: name, role: role, clubId: club
    }).returning();
    if (!user) throw new Error("User returned is null");

    // Now - create the JWT token payload
    const tokenData: z.infer<typeof JWTUserSchema> = {
        id: user.id, email: user.email
    };
    const token = await sign({ data: JSON.stringify(tokenData)}, JWT_SECRET);

    return { user, token, cookie: `${AUTH_COOKIE_NAME}=${token}`};
}