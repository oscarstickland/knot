import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { clubsTable, relations, usersTable } from "./schema";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { hashPassword } from "../services/auth";


async function generateData() {
    let pool = new Pool({connectionString: process.env.DATABASE_URL});
    let db = drizzle({ client: pool, relations: relations });

    console.log("-- Clearing Database");
    await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
    await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
    await db.execute(sql`CREATE SCHEMA public`);
    
    await pool.end();

    pool = new Pool({connectionString: process.env.DATABASE_URL});
    db = drizzle({ client: pool, relations: relations });

    console.log("-- Running Migrations");
    await migrate(db, { migrationsFolder: "./drizzle" });

    console.log("-- Inserting Club");
    const club1: typeof clubsTable.$inferInsert = {
        name: "Club 1"
    };
    const [insertedClub1] = await db.insert(clubsTable).values(club1).returning();

    
    console.log("-- Inserting User");
    const user1: typeof usersTable.$inferInsert = {
        name: "Caleb Lau",
        email: "lausy@gmail.com",
        password: await hashPassword("password"),
        clubId: insertedClub1!.id
    };
    await db.insert(usersTable).values(user1);

    await pool.end();
}

generateData();