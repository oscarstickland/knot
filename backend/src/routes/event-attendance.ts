import { Hono } from "hono";
import type { DbEnv } from "../db/connection";
import { HTTPException } from "hono/http-exception";
import { EventAttendanceInfoSchema, RegisterAttendanceSchema } from "../types/event-attendance";
import { eventAttendanceTable } from "../db/schema";

const eventAttendanceApp = new Hono<DbEnv>();

eventAttendanceApp.get("/:slug/info", async (c) => {
    const db = c.get("db");
    const slug = c.req.param("slug");

    const event = await db.query.eventsTable.findFirst({
        where: { slug },
        columns: { slug: true, name: true, start: true, end: true }
    });
    if (!event) throw new HTTPException(404, { message: "Event not found" });

    return c.json(EventAttendanceInfoSchema.parse(event));
});

eventAttendanceApp.post("/:slug/register", async (c) => {
    const db = c.get("db");
    const slug = c.req.param("slug");
    const body = await c.req.json();

    const parsed = RegisterAttendanceSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: "Invalid payload" });

    const event = await db.query.eventsTable.findFirst({
        where: { slug }
    });
    if (!event) throw new HTTPException(404, { message: "Event not found" });

    if (!event.attendanceOpen) throw new HTTPException(403, { message: "Attendance is not open for this event" });

    try {
        await db.insert(eventAttendanceTable).values({
            eventId: event.id,
            name: parsed.data.name,
            email: parsed.data.email
        });
    } catch (err) {
        const errorCode = (err as { code?: string; cause?: { code?: string } }).code
            ?? (err as { cause?: { code?: string } }).cause?.code;

        if (errorCode === "23505") {
            throw new HTTPException(409, { message: "You have already registered attendance for this event" });
        }
        throw err;
    }

    return c.json({ message: "Registered" }, 201);
});

export { eventAttendanceApp }
