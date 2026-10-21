import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect } from "bun:test";
import { type TestDatabaseHarness, setupHarness } from "../harness.ts";
import { eventMembersTable, eventsTable, tasksTable } from "../../db/schema.ts";
import type { ClubEvent } from "../../types/events.ts";

describe("Event Visibility Integration Test", () => {
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

    async function setupEvent(clubId: number, teamWide: boolean, name: string = "Event") {
        const now = new Date();
        const [event] = await harness.db
            .insert(eventsTable)
            .values({ name, location: "Main Hall", start: now, end: new Date(now.valueOf() + 5000), clubId, teamWide })
            .returning();
        if (!event) throw new Error("Event returned is null");
        return event;
    }

    it("defaults new events to team-wide", async () => {
        const club = await harness.setupClub("Club");
        const [event] = await harness.db
            .insert(eventsTable)
            .values({ name: "E", location: "L", start: new Date(), end: new Date(Date.now() + 5000), clubId: club.id })
            .returning();
        expect(event?.teamWide).toBe(true);
    });

    it("hides restricted events from standard members who are not on the team", async () => {
        const app = await harness.setupApp();
        const club = await harness.setupClub("Club");
        const event = await setupEvent(club.id, false);
        const member = await harness.setupUser("member@example.com", "standard", club.id);

        for (const path of [`/api/events/${event.id}`, `/api/events/${event.id}/team`, `/api/events/${event.id}/documents`, `/api/events/${event.id}/overview`]) {
            const res = await app.request(path, { headers: { cookie: member.cookie } });
            expect(res.status).toBe(404);
        }
    });

    it("shows restricted events to assigned standard members", async () => {
        const app = await harness.setupApp();
        const club = await harness.setupClub("Club");
        const event = await setupEvent(club.id, false);
        const member = await harness.setupUser("member@example.com", "standard", club.id);
        await harness.db.insert(eventMembersTable).values({ eventId: event.id, userId: member.user.id });

        const res = await app.request(`/api/events/${event.id}`, { headers: { cookie: member.cookie } });
        expect(res.status).toBe(200);
    });

    it("always shows restricted events to execs and admins", async () => {
        const app = await harness.setupApp();
        const club = await harness.setupClub("Club");
        const event = await setupEvent(club.id, false);
        const exec = await harness.setupUser("exec@example.com", "exec", club.id);
        const admin = await harness.setupUser("admin@example.com", "admin", club.id);

        for (const viewer of [exec, admin]) {
            const res = await app.request(`/api/events/${event.id}`, { headers: { cookie: viewer.cookie } });
            expect(res.status).toBe(200);
        }
    });

    it("only lists events a standard member can see", async () => {
        const app = await harness.setupApp();
        const club = await harness.setupClub("Club");
        await setupEvent(club.id, true, "Open");
        const mine = await setupEvent(club.id, false, "Mine");
        await setupEvent(club.id, false, "Hidden");
        const member = await harness.setupUser("member@example.com", "standard", club.id);
        await harness.db.insert(eventMembersTable).values({ eventId: mine.id, userId: member.user.id });

        const res = await app.request("/api/events?archived=false", { headers: { cookie: member.cookie } });
        const names = (await res.json() as ClubEvent[]).map((event) => event.name).sort();
        expect(names).toEqual(["Mine", "Open"]);
    });

    it("hides the tasks of a restricted event", async () => {
        const app = await harness.setupApp();
        const club = await harness.setupClub("Club");
        const event = await setupEvent(club.id, false);
        const exec = await harness.setupUser("exec@example.com", "exec", club.id);
        const member = await harness.setupUser("member@example.com", "standard", club.id);
        const [task] = await harness.db
            .insert(tasksTable)
            .values({ eventId: event.id, title: "T", description: "D", createdBy: exec.user.id })
            .returning();

        const list = await app.request(`/api/tasks?eventId=${event.id}`, { headers: { cookie: member.cookie } });
        expect(list.status).toBe(404);
        const single = await app.request(`/api/tasks/${task!.id}`, { headers: { cookie: member.cookie } });
        expect(single.status).toBe(404);
    });

    it("lets an exec restrict and reopen an event through the team endpoint", async () => {
        const app = await harness.setupApp();
        const club = await harness.setupClub("Club");
        const event = await setupEvent(club.id, true);
        const exec = await harness.setupUser("exec@example.com", "exec", club.id);
        const member = await harness.setupUser("member@example.com", "standard", club.id);

        const put = (body: unknown) => app.request(`/api/events/${event.id}/team`, {
            method: "PUT", headers: { cookie: exec.cookie }, body: JSON.stringify(body)
        });
        const memberGet = () => app.request(`/api/events/${event.id}`, { headers: { cookie: member.cookie } });

        expect((await put({ userIds: [], teamWide: false })).status).toBe(200);
        expect((await memberGet()).status).toBe(404);

        expect((await put({ userIds: [member.user.id] })).status).toBe(200);
        expect((await memberGet()).status).toBe(200);

        expect((await put({ userIds: [], teamWide: true })).status).toBe(200);
        expect((await memberGet()).status).toBe(200);
    });
});
