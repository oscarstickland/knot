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
                    location: "Main Hall",
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
                .values({ name: "Event", location: "Main Hall", start: new Date(), end: new Date(Date.now() + 5000), clubId: club.id, attendanceOpen: false })
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
                .values({ name: "Event", location: "Main Hall", start: new Date(), end: new Date(Date.now() + 5000), clubId: club.id, attendanceOpen: true })
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
                .values({ name: "Event", location: "Main Hall", start: new Date(), end: new Date(Date.now() + 5000), clubId: club.id, attendanceOpen: true })
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
                .values({ name: "Event", location: "Main Hall", start: new Date(), end: new Date(Date.now() + 5000), clubId: club.id })
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
                .values({ name: "Event", location: "Main Hall", start: new Date(), end: new Date(Date.now() + 5000), clubId: club.id })
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
                .values({ name: "Event", location: "Main Hall", start: new Date(), end: new Date(Date.now() + 5000), clubId: club.id })
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
    describe("PUT /:eventId/check-ins/:checkInId", () => {
        async function setupCheckIn(clubId: number) {
            const [event] = await harness.db
                .insert(eventsTable)
                .values({ name: "Event", location: "Main Hall", start: new Date(), end: new Date(Date.now() + 5000), clubId })
                .returning();
            const [checkIn] = await insertCheckIns(harness.db, event!.id, 1);
            return { event: event!, checkIn: checkIn! };
        }

        const put = (app: Awaited<ReturnType<TestDatabaseHarness["setupApp"]>>, path: string, cookie: string, body: unknown) =>
            app.request(path, {
                method: "PUT",
                headers: { cookie, "content-type": "application/json" },
                body: JSON.stringify(body)
            });

        it.each(["standard", "exec", "admin"] as const)("allows %s to update an attendee's details", async (role) => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("test@test.com", role, club.id, "User");
            const { event, checkIn } = await setupCheckIn(club.id);

            const res = await put(app, `/api/attendance/${event.id}/check-ins/${checkIn.id}`, cookie, { name: "New Name", email: "new@test.com" });
            expect(res.status).toBe(200);
            expect(await res.json()).toMatchObject({ id: checkIn.id, name: "New Name", email: "new@test.com" });

            const stored = await harness.db.query.eventAttendanceTable.findFirst({ where: { id: checkIn.id } });
            expect(stored).toMatchObject({ name: "New Name", email: "new@test.com" });
        });

        it("returns 400 for an invalid email", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("test@test.com", "standard", club.id, "User");
            const { event, checkIn } = await setupCheckIn(club.id);

            const res = await put(app, `/api/attendance/${event.id}/check-ins/${checkIn.id}`, cookie, { name: "Name", email: "not-an-email" });
            expect(res.status).toBe(400);
        });

        it("returns 404 for a check-in that does not exist", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("test@test.com", "standard", club.id, "User");
            const { event } = await setupCheckIn(club.id);

            const res = await put(app, `/api/attendance/${event.id}/check-ins/999999`, cookie, { name: "Name", email: "a@test.com" });
            expect(res.status).toBe(404);
        });

        it("returns 404 for an event in another club and leaves the check-in untouched", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const otherClub = await harness.setupClub("Other Club");
            const { cookie } = await harness.setupUser("outsider@test.com", "admin", otherClub.id, "Outsider");
            const { event, checkIn } = await setupCheckIn(club.id);

            const res = await put(app, `/api/attendance/${event.id}/check-ins/${checkIn.id}`, cookie, { name: "Hacked", email: "hacked@test.com" });
            expect(res.status).toBe(404);

            const stored = await harness.db.query.eventAttendanceTable.findFirst({ where: { id: checkIn.id } });
            expect(stored?.name).toBe(checkIn.name);
        });

        it("returns 409 when the email is already used by another attendee of the event", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("test@test.com", "standard", club.id, "User");
            const [event] = await harness.db
                .insert(eventsTable)
                .values({ name: "Event", location: "Main Hall", start: new Date(), end: new Date(Date.now() + 5000), clubId: club.id })
                .returning();
            const [first, second] = await insertCheckIns(harness.db, event!.id, 2);

            const res = await put(app, `/api/attendance/${event!.id}/check-ins/${first!.id}`, cookie, { name: first!.name, email: second!.email });
            expect(res.status).toBe(409);
        });
    });
});
