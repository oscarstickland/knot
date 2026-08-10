import {Hono} from "hono";
import {isAuthenticated, type UserEnv} from "../services/auth.ts";
import type {DbEnv} from "../db/connection.ts";
import {zValidator} from "@hono/zod-validator";
import { z } from 'zod';
import {HTTPException} from "hono/http-exception";
import {UpdateEventSchema} from "../types/events.ts";
import {clubsTable, eventsTable} from "../db/schema.ts";
import {and, eq} from "drizzle-orm";

const eventsApp = new Hono<UserEnv & DbEnv>();
eventsApp.use("*", isAuthenticated);

eventsApp.get("/", async (c) => {
    const user = c.var.user;
    const db = c.get('db');

    const events = await db.query.eventsTable.findMany({
        where: { clubId: user.club.id }
    });

    return c.json(events);
});

eventsApp.post("/", async (c) => {
    const user = c.var.user;
    const db = c.get('db');
    const body = await c.req.json();

    const parsed = UpdateEventSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: "Invalid payload" });

    const newEvent = await db
        .insert(eventsTable)
        .values({...parsed.data, clubId: user.club.id});
    return c.json({ message: "Created" }, 201)
})

eventsApp.get("/:id{[0-9]+}", async (c) => {
    const eventId = Number(c.req.param("id"));
    const db = c.get('db');
    const user = c.var.user;

    const event = await db.query.eventsTable.findFirst({
        where: { id: eventId, clubId: user.club.id }
    })

    if (!event) throw new HTTPException(404);
    return c.json(event);
});

eventsApp.put("/:id{[0-9]+}", async (c) => {
    const eventId = Number(c.req.param("id"));
    const db = c.get("db");
    const user = c.var.user;
    const body = await c.req.json();

    const parsed = UpdateEventSchema.safeParse(body);

    if (!parsed.success) throw new HTTPException(400, { message: "Invalid payload" });

    const [updatedEvent] = await db
        .update(eventsTable)
        .set(parsed.data)
        .where(and(eq(eventsTable.clubId, user.club.id), eq(eventsTable.id, eventId)))
        .returning();

    if (!updatedEvent) throw new HTTPException(404, { message: "Event not found or unauthorized" });

    return c.json(updatedEvent);
});

export { eventsApp };