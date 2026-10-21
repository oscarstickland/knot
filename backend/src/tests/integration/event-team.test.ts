import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect } from "bun:test";
import { type TestDatabaseHarness, setupHarness } from "../harness.ts";
import { eq } from "drizzle-orm";
import { eventMembersTable, eventsTable, usersTable } from "../../db/schema.ts";
import type { EventTeamMember } from "../../types/event-team.ts";

type HTTPError = {
    message: string
}

describe("Event Team Integration Test", () => {
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

    type App = Awaited<ReturnType<TestDatabaseHarness["setupApp"]>>;

    async function setupEvent(clubId: number) {
        const now = new Date();
        const [event] = await harness.db
            .insert(eventsTable)
            .values({ name: "Event", location: "Main Hall", start: now, end: new Date(now.valueOf() + 5000), clubId })
            .returning();
        if (!event) throw new Error("Event returned is null");
        return event;
    }

    function getTeam(app: App, eventId: number, cookie?: string) {
        return app.request(`/api/events/${eventId}/team`, { headers: cookie ? { cookie } : {} });
    }

    function putTeam(app: App, eventId: number, cookie: string, body: unknown) {
        return app.request(`/api/events/${eventId}/team`, {
            method: "PUT",
            headers: { cookie },
            body: JSON.stringify(body)
        });
    }

    describe("GET /api/events/:id/team", () => {
        it("requires authentication", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);

            expect((await getTeam(app, event.id)).status).toBe(401);
        });

        it("lets standard members see the team, sorted by name", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const viewer = await harness.setupUser("viewer@example.com", "standard", club.id, "Viewer");
            const zed = await harness.setupUser("zed@example.com", "standard", club.id, "Zed");
            const amy = await harness.setupUser("amy@example.com", "exec", club.id, "Amy");
            await harness.db.insert(eventMembersTable).values([
                { eventId: event.id, userId: zed.user.id },
                { eventId: event.id, userId: amy.user.id }
            ]);

            const res = await getTeam(app, event.id, viewer.cookie);
            expect(res.status).toBe(200);
            const team = await res.json() as EventTeamMember[];
            expect(team).toEqual([
                { id: amy.user.id, name: "Amy", role: "exec" },
                { id: zed.user.id, name: "Zed", role: "standard" }
            ]);
        });

        it("returns 404 for an event in another club", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const other = await harness.setupClub("Other");
            const event = await setupEvent(other.id);
            const viewer = await harness.setupUser("viewer@example.com", "admin", club.id);

            expect((await getTeam(app, event.id, viewer.cookie)).status).toBe(404);
        });
    });

    describe("PUT /api/events/:id/team", () => {
        it("lets an exec assign members", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const exec = await harness.setupUser("exec@example.com", "exec", club.id, "Exec");
            const member = await harness.setupUser("member@example.com", "standard", club.id, "Member");

            const res = await putTeam(app, event.id, exec.cookie, { userIds: [member.user.id, exec.user.id] });
            expect(res.status).toBe(200);
            const team = await res.json() as EventTeamMember[];
            expect(team.map((m) => m.id).sort()).toEqual([exec.user.id, member.user.id].sort());
        });

        it("lets an admin replace and clear the team", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const admin = await harness.setupUser("admin@example.com", "admin", club.id);
            const a = await harness.setupUser("a@example.com", "standard", club.id, "A");
            const b = await harness.setupUser("b@example.com", "standard", club.id, "B");

            await putTeam(app, event.id, admin.cookie, { userIds: [a.user.id] });
            const replaced = await (await putTeam(app, event.id, admin.cookie, { userIds: [b.user.id] })).json() as EventTeamMember[];
            expect(replaced.map((m) => m.id)).toEqual([b.user.id]);

            const cleared = await (await putTeam(app, event.id, admin.cookie, { userIds: [] })).json() as EventTeamMember[];
            expect(cleared).toEqual([]);
        });

        it("ignores duplicate ids", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const admin = await harness.setupUser("admin@example.com", "admin", club.id);
            const a = await harness.setupUser("a@example.com", "standard", club.id, "A");

            const res = await putTeam(app, event.id, admin.cookie, { userIds: [a.user.id, a.user.id] });
            expect(res.status).toBe(200);
            expect(await res.json() as EventTeamMember[]).toHaveLength(1);
        });

        it("forbids standard members", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const member = await harness.setupUser("member@example.com", "standard", club.id);

            const res = await putTeam(app, event.id, member.cookie, { userIds: [member.user.id] });
            expect(res.status).toBe(403);
        });

        it("rejects users from another club", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const other = await harness.setupClub("Other");
            const event = await setupEvent(club.id);
            const admin = await harness.setupUser("admin@example.com", "admin", club.id);
            const outsider = await harness.setupUser("outsider@example.com", "standard", other.id);

            const res = await putTeam(app, event.id, admin.cookie, { userIds: [outsider.user.id] });
            expect(res.status).toBe(400);
            expect((await res.json() as HTTPError).message).toContain("active member");
        });

        it("rejects offboarded users", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const admin = await harness.setupUser("admin@example.com", "admin", club.id);
            const gone = await harness.setupUser("gone@example.com", "standard", club.id);
            await harness.db.update(usersTable).set({ status: "offboarded" }).where(eq(usersTable.id, gone.user.id));

            const res = await putTeam(app, event.id, admin.cookie, { userIds: [gone.user.id] });
            expect(res.status).toBe(400);
        });

        it("rejects a malformed body", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const admin = await harness.setupUser("admin@example.com", "admin", club.id);

            expect((await putTeam(app, event.id, admin.cookie, { userIds: "nope" })).status).toBe(400);
        });

        it("returns 404 for an event in another club", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const other = await harness.setupClub("Other");
            const event = await setupEvent(other.id);
            const admin = await harness.setupUser("admin@example.com", "admin", club.id);

            expect((await putTeam(app, event.id, admin.cookie, { userIds: [] })).status).toBe(404);
        });
    });
});
