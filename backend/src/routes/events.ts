import {Hono} from "hono";
import {isAuthenticated, type UserEnv} from "../services/auth.ts";
import type {DbEnv} from "../db/connection.ts";
import {zValidator} from "@hono/zod-validator";
import { z } from 'zod';
import {HTTPException} from "hono/http-exception";
import {ArchiveEventSchema, UpdateEventSchema} from "../types/events.ts";
import {clubsTable, eventsTable} from "../db/schema.ts";
import {and, eq} from "drizzle-orm";

const eventsApp = new Hono<UserEnv & DbEnv>();
eventsApp.use("*", isAuthenticated);

eventsApp.get("/", async (c) => {
    const user = c.var.user;
    const db = c.get('db');
    const showArchived = c.req.query("archived") === "true";

    if (showArchived && user.role !== "admin" && user.role !== "exec") {
        throw new HTTPException(403);
    }

    const events = await db.query.eventsTable.findMany({
        where: { clubId: user.club.id, archived: showArchived }
    });

    return c.json(events);
});

eventsApp.post("/", async (c) => {
    const user = c.var.user;
    const db = c.get('db');
    const body = await c.req.json();

    if (user.role != "admin" && user.role != "exec") {
        throw new HTTPException(403);
    }

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
    if (event.archived && user.role !== "admin" && user.role !== "exec") throw new HTTPException(404);

    return c.json(event);
});

eventsApp.put("/:id{[0-9]+}", async (c) => {
    const eventId = Number(c.req.param("id"));
    const db = c.get("db");
    const user = c.var.user;
    const body = await c.req.json();

    const parsed = UpdateEventSchema.safeParse(body);

    if (!parsed.success) throw new HTTPException(400, { message: "Invalid payload" });

    const existingEvent = await db.query.eventsTable.findFirst({
        where: { id: eventId, clubId: user.club.id }
    });

    if (!existingEvent) throw new HTTPException(404, { message: "Event not found or unauthorized" });
    if (existingEvent.archived || ( user.role !== "admin" && user.role !== "exec")) {
        throw new HTTPException(404, { message: "Event not found or unauthorized" });
    }

    const [updatedEvent] = await db
        .update(eventsTable)
        .set(parsed.data)
        .where(and(eq(eventsTable.clubId, user.club.id), eq(eventsTable.id, eventId)))
        .returning();

    if (!updatedEvent) throw new HTTPException(404, { message: "Event not found or unauthorized" });

    return c.json(updatedEvent);
});

eventsApp.patch("/:id{[0-9]+}/archive", async (c) => {
    const eventId = Number(c.req.param("id"));
    const db = c.get("db");
    const user = c.var.user;

    if (user.role !== "admin" && user.role !== "exec") throw new HTTPException(403);

    const body = await c.req.json();
    const parsed = ArchiveEventSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: "Invalid payload" });

    const [updatedEvent] = await db
        .update(eventsTable)
        .set({ archived: parsed.data.archived })
        .where(and(eq(eventsTable.clubId, user.club.id), eq(eventsTable.id, eventId)))
        .returning();

    if (!updatedEvent) throw new HTTPException(404, { message: "Event not found or unauthorized" });

    return c.json(updatedEvent);
});

export { eventsApp };