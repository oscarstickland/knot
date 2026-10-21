import { eventAccess } from "../services/event-access.ts";
import { Hono } from "hono";
import type { DbEnv } from "../db/connection";
import { isAuthenticated, type UserEnv } from "../services/auth";
import { HTTPException } from "hono/http-exception";
import {
    AttendanceCheckInSchema,
    AttendanceSummarySchema,
    EventAttendanceInfoSchema,
    RegisterAttendanceSchema,
    UpdateAttendanceSchema
} from "../types/event-attendance";
import { eventAttendanceTable } from "../db/schema";
import { and, count, eq, max } from "drizzle-orm";
import { describeZodError } from "../types/errors";

const eventAttendanceApp = new Hono<UserEnv & DbEnv>();

eventAttendanceApp.get("/:slug/info", async (c) => {
    const db = c.get("db");
    const slug = c.req.param("slug");

    const event = await db.query.eventsTable.findFirst({
        where: { slug },
        columns: { slug: true, name: true, start: true, end: true, attendanceOpen: true },
        with: { club: { columns: { archivedAt: true } } }
    });
    // Archived clubs are switched off, including their public check-in pages
    if (!event || event.club?.archivedAt) throw new HTTPException(404, { message: "Event not found" });

    return c.json(EventAttendanceInfoSchema.parse(event));
});

eventAttendanceApp.post("/:slug/register", async (c) => {
    const db = c.get("db");
    const slug = c.req.param("slug");
    const body = await c.req.json();

    const parsed = RegisterAttendanceSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: describeZodError(parsed.error) });

    const event = await db.query.eventsTable.findFirst({
        where: { slug },
        with: { club: { columns: { archivedAt: true } } }
    });
    if (!event || event.club?.archivedAt) throw new HTTPException(404, { message: "Event not found" });

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

eventAttendanceApp.get("/:eventId{[0-9]+}/summary", isAuthenticated, async (c) => {
    const user = c.var.user;
    const db = c.get("db");
    const eventId = Number(c.req.param("eventId"));

    const event = await db.query.eventsTable.findFirst({
        where: { id: eventId, ...eventAccess(user) }
    });
    if (!event) throw new HTTPException(404, { message: "Event not found" });

    const [summary] = await db
        .select({
            checkedIn: count(eventAttendanceTable.id),
            lastCheckIn: max(eventAttendanceTable.createdAt)
        })
        .from(eventAttendanceTable)
        .where(eq(eventAttendanceTable.eventId, eventId));

    return c.json(AttendanceSummarySchema.parse(summary));
});

eventAttendanceApp.get("/:eventId{[0-9]+}/check-ins", isAuthenticated, async (c) => {
    const user = c.var.user;
    const db = c.get("db");
    const eventId = Number(c.req.param("eventId"));

    const event = await db.query.eventsTable.findFirst({
        where: { id: eventId, ...eventAccess(user) }
    });
    if (!event) throw new HTTPException(404, { message: "Event not found" });

    const checkIns = await db.query.eventAttendanceTable.findMany({
        where: { eventId },
        columns: { id: true, name: true, email: true, createdAt: true },
        orderBy: { createdAt: "asc" }
    });

    return c.json(AttendanceCheckInSchema.array().parse(checkIns));
});

// Any club member (not just execs and admins) can correct an attendee's details.
eventAttendanceApp.put("/:eventId{[0-9]+}/check-ins/:checkInId{[0-9]+}", isAuthenticated, async (c) => {
    const user = c.var.user;
    const db = c.get("db");
    const eventId = Number(c.req.param("eventId"));
    const checkInId = Number(c.req.param("checkInId"));

    const event = await db.query.eventsTable.findFirst({
        where: { id: eventId, ...eventAccess(user) }
    });
    if (!event) throw new HTTPException(404, { message: "Event not found" });

    const body = await c.req.json();
    const parsed = UpdateAttendanceSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: describeZodError(parsed.error) });

    try {
        const [updated] = await db
            .update(eventAttendanceTable)
            .set({ name: parsed.data.name, email: parsed.data.email })
            .where(and(eq(eventAttendanceTable.id, checkInId), eq(eventAttendanceTable.eventId, eventId)))
            .returning({
                id: eventAttendanceTable.id,
                name: eventAttendanceTable.name,
                email: eventAttendanceTable.email,
                createdAt: eventAttendanceTable.createdAt
            });
        if (!updated) throw new HTTPException(404, { message: "Check-in not found" });

        return c.json(AttendanceCheckInSchema.parse(updated));
    } catch (err) {
        if (err instanceof HTTPException) throw err;

        const errorCode = (err as { code?: string; cause?: { code?: string } }).code
            ?? (err as { cause?: { code?: string } }).cause?.code;
        if (errorCode === "23505") {
            throw new HTTPException(409, { message: "Another attendee has already registered with that email for this event" });
        }
        throw err;
    }
});

export { eventAttendanceApp }
