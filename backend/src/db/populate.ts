import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import {
    clubsTable,
    eventsTable,
    relations,
    taskAssignmentsTable,
    taskAuditLogTable,
    taskDependenciesTable,
    taskDocumentsTable,
    tasksTable,
    usersTable
} from "./schema";
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

    
    console.log("-- Inserting Users");
    const user1: typeof usersTable.$inferInsert = {
        name: "Caleb Lau",
        email: "admin@gmail.com",
        password: await hashPassword("password"),
        role: "admin",
        clubId: insertedClub1!.id
    };
    const [insertedUser1] = await db.insert(usersTable).values(user1).returning();

    const user2: typeof usersTable.$inferInsert = {
        name: "Wesley Tang",
        email: "exec@gmail.com",
        password: await hashPassword("password"),
        role: "exec",
        clubId: insertedClub1!.id
    };
    const [insertedUser2] = await db.insert(usersTable).values(user2).returning();

    const user3: typeof usersTable.$inferInsert = {
        name: "Flynn Tiong",
        email: "standard@gmail.com",
        password: await hashPassword("password"),
        role: "standard",
        clubId: insertedClub1!.id
    };
    const [insertedUser3] = await db.insert(usersTable).values(user3).returning();

    console.log("-- Inserting Events");
    const event1: typeof eventsTable.$inferInsert = {
        name: "MAC Open Day",
        clubId: insertedClub1!.id,
        start: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        end: new Date(Date.now() + 3.1 * 24 * 60 * 60 * 1000)
    }
    const [insertedEvent1] = await db.insert(eventsTable).values(event1).returning();

    const event2: typeof eventsTable.$inferInsert = {
        name: "MACathon",
        clubId: insertedClub1!.id,
        start: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        end: new Date(Date.now() + 5.1 * 24 * 60 * 60 * 1000)
    }
    const [insertedEvent2] = await db.insert(eventsTable).values(event2).returning();

    const event3: typeof eventsTable.$inferInsert = {
        name: "Welcome BBQ",
        clubId: insertedClub1!.id,
        start: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        end: new Date(Date.now() - 9.9 * 24 * 60 * 60 * 1000),
        archived: true
    }
    await db.insert(eventsTable).values(event3);

    console.log("-- Inserting Tasks");
    const task1: typeof tasksTable.$inferInsert = {
        eventId: insertedEvent1!.id,
        title: "Book venue",
        description: "Confirm the hall booking and pay the deposit",
        priority: "high",
        progress: "in_progress",
        dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        createdBy: insertedUser1!.id
    };
    const [insertedTask1] = await db.insert(tasksTable).values(task1).returning();

    const task2: typeof tasksTable.$inferInsert = {
        eventId: insertedEvent1!.id,
        title: "Send invitations",
        description: "Email the open day invite to the mailing list",
        priority: "medium",
        progress: "backlog",
        dueDate: null,
        createdBy: insertedUser1!.id
    };
    const [insertedTask2] = await db.insert(tasksTable).values(task2).returning();

    console.log("-- Inserting Task Assignments");
    await db.insert(taskAssignmentsTable).values([
        { taskId: insertedTask1!.id, userId: insertedUser2!.id },
        { taskId: insertedTask2!.id, userId: insertedUser2!.id },
        { taskId: insertedTask2!.id, userId: insertedUser3!.id }
    ]);

    console.log("-- Inserting Task Dependencies");
    await db.insert(taskDependenciesTable).values({
        taskId: insertedTask2!.id,
        dependsOnTaskId: insertedTask1!.id
    });

    console.log("-- Inserting Task Documents");
    await db.insert(taskDocumentsTable).values({
        taskId: insertedTask1!.id,
        url: "https://example.com/venue-contract.pdf",
        addedBy: insertedUser1!.id
    });

    console.log("-- Inserting Task Audit Log");
    await db.insert(taskAuditLogTable).values({
        taskId: insertedTask1!.id,
        changedBy: insertedUser1!.id,
        action: "created",
        changes: task1
    });

    await pool.end();
}

generateData();