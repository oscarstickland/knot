import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect } from "bun:test";
import { type TestDatabaseHarness, setupHarness } from "../harness.ts";
import { eventsTable } from "../../db/schema.ts";

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
