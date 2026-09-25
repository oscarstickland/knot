import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect } from "bun:test";
import { type TestDatabaseHarness, setupHarness } from "../harness.ts";
import { eventAttendanceTable, eventsTable } from "../../db/schema.ts";

async function insertCheckIns(db: TestDatabaseHarness["db"], eventId: number, count: number) {
    if (count === 0) return [];

    const baseTime = Date.now();
    const rows = Array.from({ length: count }, (_, i) => ({
        eventId,
        name: `Attendee ${i}`,
        email: `attendee${i}@test.com`,
        createdAt: new Date(baseTime + i * 1000)
    }));

    return db.insert(eventAttendanceTable).values(rows).returning();
}

describe("Database Integration Test", () => {
    let harness: TestDatabaseHarness;

    beforeAll(async () => {
        harness = await setupHarness();
    }, 60000);

    afterAll(async () => {
        await harness.close();
    }, 60000);

    beforeEach(async () => {
        await harness.startTransaction();
    });

    afterEach(async () => {
        await harness.rollbackTransaction();
    });

    describe("GET /:slug/info", () => {
        it("returns 404 when fetching info for an event that does not exist", async () => {
            const app = await harness.setupApp();

            const res = await app.request("/api/attendance/non-existent-slug/info");
            expect(res.status).toBe(404);
        });

        it.each([true, false])("returns the slug, name, dates and attendanceOpen for an event's info", async (attendanceOpen) => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const referenceDate = new Date();

            const [event] = await harness.db
                .insert(eventsTable)
                .values({
                    name: "Event",
                    start: referenceDate,
                    end: new Date(referenceDate.valueOf() + 5000),
                    clubId: club.id,
                    attendanceOpen
                })
                .returning();

            const res = await app.request(`/api/attendance/${event!.slug}/info`);
            expect(res.status).toBe(200);

            const body = await res.json();
            expect(body).toEqual({
                slug: event!.slug,
                name: "Event",
                start: referenceDate.toISOString(),
                end: new Date(referenceDate.valueOf() + 5000).toISOString(),
                attendanceOpen
            });
        });
    });

    describe("POST /:slug/register", () => {
        it("returns 404 when registering attendance for an event that does not exist", async () => {
            const app = await harness.setupApp();

            const res = await app.request("/api/attendance/non-existent-slug/register", {
                method: "POST",
                body: JSON.stringify({ name: "Attendee", email: "attendee@test.com" })
            });
            expect(res.status).toBe(404);
        });

        it("returns 403 when registering attendance for an event with attendance closed", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");

            const [event] = await harness.db
                .insert(eventsTable)
                .values({ name: "Event", start: new Date(), end: new Date(Date.now() + 5000), clubId: club.id, attendanceOpen: false })
                .returning();

            const res = await app.request(`/api/attendance/${event!.slug}/register`, {
                method: "POST",
                body: JSON.stringify({ name: "Attendee", email: "attendee@test.com" })
            });
            expect(res.status).toBe(403);
        });

        it("returns 201 and registers attendance for an event with attendance open", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");

            const [event] = await harness.db
                .insert(eventsTable)
                .values({ name: "Event", start: new Date(), end: new Date(Date.now() + 5000), clubId: club.id, attendanceOpen: true })
                .returning();

            const res = await app.request(`/api/attendance/${event!.slug}/register`, {
                method: "POST",
                body: JSON.stringify({ name: "Attendee", email: "attendee@test.com" })
            });
            expect(res.status).toBe(201);

            const attendance = await harness.db.query.eventAttendanceTable.findFirst({
                where: { eventId: event!.id, email: "attendee@test.com" }
            });
            expect(attendance).not.toBeUndefined();
            expect(attendance!.name).toEqual("Attendee");
        });

        it("returns 409 when registering attendance twice with the same email for an event", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");

            const [event] = await harness.db
                .insert(eventsTable)
                .values({ name: "Event", start: new Date(), end: new Date(Date.now() + 5000), clubId: club.id, attendanceOpen: true })
                .returning();

            const firstRes = await app.request(`/api/attendance/${event!.slug}/register`, {
                method: "POST",
                body: JSON.stringify({ name: "Attendee", email: "attendee@test.com" })
            });
            expect(firstRes.status).toBe(201);

            const secondRes = await app.request(`/api/attendance/${event!.slug}/register`, {
                method: "POST",
                body: JSON.stringify({ name: "Attendee", email: "attendee@test.com" })
            });
            expect(secondRes.status).toBe(409);
        });
    });

    describe("GET /:eventId/summary", () => {
        it("returns 404 when fetching the summary for an event that does not exist", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("test@test.com", "admin", club.id, "User");

            const res = await app.request("/api/attendance/999999/summary", {
                headers: { cookie }
            });
            expect(res.status).toBe(404);
        });

        it.each([0, 2, 10])("returns the checked in count and last check-in for %i attendees", async (checkInCount) => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("test@test.com", "admin", club.id, "User");

            const [event] = await harness.db
                .insert(eventsTable)
                .values({ name: "Event", start: new Date(), end: new Date(Date.now() + 5000), clubId: club.id })
                .returning();

            const checkIns = await insertCheckIns(harness.db, event!.id, checkInCount);

            const res = await app.request(`/api/attendance/${event!.id}/summary`, {
                headers: { cookie }
            });
            expect(res.status).toBe(200);

            const body = await res.json();

            if (checkInCount === 0) {
                expect(body).toEqual({ checkedIn: 0, lastCheckIn: null });
            } else {
                const lastCheckIn = checkIns[checkIns.length - 1]!;
                expect(body).toEqual({ checkedIn: checkInCount, lastCheckIn: lastCheckIn.createdAt.toISOString() });
            }
        });
    });

    describe("GET /:eventId/check-ins", () => {
        it("returns 404 when fetching check-ins for an event that does not exist", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("test@test.com", "admin", club.id, "User");

            const res = await app.request("/api/attendance/999999/check-ins", {
                headers: { cookie }
            });
            expect(res.status).toBe(404);
        });

        it.each([0, 2, 10])("returns all %i check-ins for an event", async (checkInCount) => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("test@test.com", "admin", club.id, "User");

            const [event] = await harness.db
                .insert(eventsTable)
                .values({ name: "Event", start: new Date(), end: new Date(Date.now() + 5000), clubId: club.id })
                .returning();

            const checkIns = await insertCheckIns(harness.db, event!.id, checkInCount);

            const res = await app.request(`/api/attendance/${event!.id}/check-ins`, {
                headers: { cookie }
            });
            expect(res.status).toBe(200);

            const body = await res.json();
            expect(body).toHaveLength(checkInCount);
            expect(body).toEqual(checkIns.map((checkIn) => ({
                id: checkIn.id,
                name: checkIn.name,
                email: checkIn.email,
                createdAt: checkIn.createdAt.toISOString()
            })));
        });

        it("returns check-ins sorted oldest first, regardless of insertion order", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("test@test.com", "admin", club.id, "User");

            const [event] = await harness.db
                .insert(eventsTable)
                .values({ name: "Event", start: new Date(), end: new Date(Date.now() + 5000), clubId: club.id })
                .returning();

            const now = Date.now();

            // Insert deliberately out of chronological order to prove the endpoint sorts them,
            // rather than relying on incidental insertion/physical row order.
            const [later] = await harness.db.insert(eventAttendanceTable)
                .values({ eventId: event!.id, name: "Later", email: "later@test.com", createdAt: new Date(now + 5000) })
                .returning();
            const [earliest] = await harness.db.insert(eventAttendanceTable)
                .values({ eventId: event!.id, name: "Earliest", email: "earliest@test.com", createdAt: new Date(now) })
                .returning();
            const [middle] = await harness.db.insert(eventAttendanceTable)
                .values({ eventId: event!.id, name: "Middle", email: "middle@test.com", createdAt: new Date(now + 2000) })
                .returning();

            const res = await app.request(`/api/attendance/${event!.id}/check-ins`, {
                headers: { cookie }
            });
            expect(res.status).toBe(200);

            const body = await res.json() as { email: string }[];
            expect(body.map((checkIn) => checkIn.email)).toEqual([
                earliest!.email, middle!.email, later!.email
            ]);
        });
    });
});
