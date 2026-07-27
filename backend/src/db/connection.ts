import { drizzle } from "drizzle-orm/node-postgres";
import { relations } from "./schema";
import { Pool } from "pg";
import { createMiddleware } from "hono/factory";

const pool = new Pool({connectionString: process.env.DATABASE_URL});
const db = drizzle({ client: pool, relations: relations });

export type DbEnv = {
    Variables: {
        db: typeof db
    }
}

export const attachDatabase = createMiddleware<DbEnv>(async (c, next) => {
    c.set("db", db);
    await next();
})