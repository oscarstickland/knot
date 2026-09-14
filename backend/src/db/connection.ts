import {drizzle, type NodePgDatabase} from "drizzle-orm/node-postgres";
import { relations } from "./schema";
import { Pool } from "pg";
import { createMiddleware } from "hono/factory";

const pool = new Pool({connectionString: process.env.DATABASE_URL});

// pg.Pool emits 'error' on background/idle client failures (e.g. connection
// refused, db restart). Without a listener, this throws unhandled and
// crashes the process - so log it instead.
pool.on("error", (err) => {
    console.error("Unexpected error on idle database client", err);
});

const db = drizzle({ client: pool, relations: relations });

export type DbEnv = {
    Variables: {
        db: NodePgDatabase<typeof relations>
    }
}

export const attachDatabase = createMiddleware<DbEnv>(async (c, next) => {
    c.set("db", db);
    await next();
})

export const DBConnection = db;