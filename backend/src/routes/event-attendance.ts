import { Hono } from "hono";
import type { DbEnv } from "../db/connection";
import { HTTPException } from "hono/http-exception";
import { RegisterAttendanceSchema } from "../types/event-attendance";
import { eventAttendanceTable } from "../db/schema";
import { DatabaseError } from "pg";

const eventAttendanceApp = new Hono<DbEnv>();

eventAttendanceApp.post("/:eventId{[0-9]+}/register", async (c) => {
    const db = c.get("db");
    const eventId = Number(c.req.param("eventId"));
    const body = await c.req.json();

    const parsed = RegisterAttendanceSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: "Invalid payload" });

    const event = await db.query.eventsTable.findFirst({
        where: { id: eventId }
    });
    if (!event) throw new HTTPException(404, { message: "Event not found" });

    if (!event.attendanceOpen) throw new HTTPException(403, { message: "Attendance is not open for this event" });

    try {
        await db.insert(eventAttendanceTable).values({
            eventId,
            name: parsed.data.name,
            email: parsed.data.email
        });
    } catch (err) {
        if (err instanceof DatabaseError && err.code === "23505") {
            throw new HTTPException(409, { message: "You have already registered attendance for this event" });
        }
        throw err;
    }

    return c.json({ message: "Registered" }, 201);
});

export { eventAttendanceApp }
