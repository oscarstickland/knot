import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect } from "bun:test";
import { eq } from "drizzle-orm";
import { type TestDatabaseHarness, setupHarness } from "../harness.ts";
import {
    clubsTable, eventsTable, taskAssignmentsTable, tasksTable, usersTable
} from "../../db/schema.ts";
import { hashPassword } from "../../services/auth.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("Super Admin Integration Test", () => {
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

    async function setup() {
        const app = await harness.setupApp();
        const { cookie } = await harness.setupUser("root@test.com", "superadmin", null, "Root");
        const request = (path: string, init: { method?: string; body?: unknown; cookie?: string } = {}) =>
            app.request(`/api/super-admin${path}`, {
                method: init.method ?? "GET",
                headers: { cookie: init.cookie ?? cookie },
                body: init.body === undefined ? undefined : JSON.stringify(init.body)
            });
        return { app, cookie, request };
    }

    describe("access control", () => {
        it.each(["standard", "exec", "admin"] as const)("forbids %s users", async (role) => {
            const { request } = await setup();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("member@test.com", role, club.id);

            expect((await request("/clubs", { cookie })).status).toBe(403);
        });

        it("rejects unauthenticated requests", async () => {
            const app = await harness.setupApp();
            const res = await app.request("/api/super-admin/clubs");
            expect(res.status).toBe(401);
        });

        it("keeps super admins out of the club app", async () => {
            const { app, cookie } = await setup();
            const res = await app.request("/api/events", { headers: { cookie } });
            expect(res.status).toBe(403);
        });

        it("lets a super admin load their own session from /user/me", async () => {
            const { app, cookie } = await setup();
            const res = await app.request("/api/user/me", { headers: { cookie } });
            expect(res.status).toBe(200);
            expect(await res.json()).toMatchObject({ email: "root@test.com", role: "superadmin", club: null });
        });

        it("still returns club users from /user/me", async () => {
            const { app } = await setup();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("member@test.com", "exec", club.id);
            const res = await app.request("/api/user/me", { headers: { cookie } });
            expect(await res.json()).toMatchObject({ role: "exec", club: { id: club.id, name: "Club" } });
        });
    });

    describe("login", () => {
        it("logs a super admin in and returns a club-less session", async () => {
            const { app } = await setup();
            await harness.db.update(usersTable)
                .set({ password: await hashPassword("password123") })
                .where(eq(usersTable.email, "root@test.com"));

            const res = await app.request("/api/auth/login", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ email: "root@test.com", password: "password123" })
            });
            expect(res.status).toBe(200);
            expect(await res.json()).toMatchObject({ role: "superadmin", club: null });
        });

        it("blocks login for members of an archived club", async () => {
            const { app } = await setup();
            const club = await harness.setupClub("Club");
            await harness.setupUser("member@test.com", "standard", club.id);
            await harness.db.update(usersTable)
                .set({ password: await hashPassword("password123") })
                .where(eq(usersTable.email, "member@test.com"));
            await harness.db.update(clubsTable).set({ archivedAt: new Date() }).where(eq(clubsTable.id, club.id));

            const res = await app.request("/api/auth/login", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ email: "member@test.com", password: "password123" })
            });
            expect(res.status).toBe(401);
        });

        it("locks out existing sessions when the club is archived", async () => {
            const { app, request } = await setup();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("member@test.com", "admin", club.id);

            expect((await app.request("/api/events", { headers: { cookie } })).status).toBe(200);
            await request(`/clubs/${club.id}/archive`, { method: "POST" });
            expect((await app.request("/api/events", { headers: { cookie } })).status).toBe(401);
        });
    });

    describe("archived clubs and public check-in", () => {
        it("hides the public attendance page of an archived club", async () => {
            const { app, request } = await setup();
            const club = await harness.setupClub("Club");
            const [event] = await harness.db.insert(eventsTable).values({
                name: "E", location: "V", clubId: club.id, start: new Date(), end: new Date(), attendanceOpen: true
            }).returning();

            expect((await app.request(`/api/attendance/${event!.slug}/info`)).status).toBe(200);
            await request(`/clubs/${club.id}/archive`, { method: "POST" });

            expect((await app.request(`/api/attendance/${event!.slug}/info`)).status).toBe(404);
            const register = await app.request(`/api/attendance/${event!.slug}/register`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ name: "Guest", email: "guest@test.com" })
            });
            expect(register.status).toBe(404);
        });
    });

    describe("clubs", () => {
        it("creates and lists clubs with member counts", async () => {
            const { request } = await setup();
            const created = await request("/clubs", { method: "POST", body: { name: "  Chess  " } });
            expect(created.status).toBe(201);
            const club = await created.json() as { id: number; name: string };
            expect(club.name).toBe("Chess");

            await harness.setupUser("a@test.com", "admin", club.id);
            await harness.setupUser("b@test.com", "standard", club.id);
            await harness.db.update(usersTable).set({ status: "offboarded" }).where(eq(usersTable.email, "b@test.com"));

            const list = await (await request("/clubs")).json() as { name: string; memberCount: number; activeMemberCount: number }[];
            expect(list).toHaveLength(1);
            expect(list[0]).toMatchObject({ name: "Chess", memberCount: 2, activeMemberCount: 1 });
        });

        it("does not count super admins towards any club", async () => {
            const { request } = await setup();
            await harness.setupClub("Empty");
            const list = await (await request("/clubs")).json() as { memberCount: number }[];
            expect(list[0]!.memberCount).toBe(0);
        });

        it("rejects a blank club name", async () => {
            const { request } = await setup();
            expect((await request("/clubs", { method: "POST", body: { name: "  " } })).status).toBe(400);
        });

        it("renames a club", async () => {
            const { request } = await setup();
            const club = await harness.setupClub("Old");
            const res = await request(`/clubs/${club.id}`, { method: "PATCH", body: { name: "New" } });
            expect(res.status).toBe(200);
            expect((await harness.db.query.clubsTable.findFirst({ where: { id: club.id } }))!.name).toBe("New");
        });

        it("archives and restores a club", async () => {
            const { request } = await setup();
            const club = await harness.setupClub("Club");

            const archived = await (await request(`/clubs/${club.id}/archive`, { method: "POST" })).json() as { archivedAt: string; deletableAt: string };
            expect(archived.archivedAt).toBeTruthy();
            expect(new Date(archived.deletableAt).getTime() - new Date(archived.archivedAt).getTime()).toBe(7 * DAY_MS);
            expect((await request(`/clubs/${club.id}/archive`, { method: "POST" })).status).toBe(400);

            expect((await request(`/clubs/${club.id}/restore`, { method: "POST" })).status).toBe(200);
            expect((await request(`/clubs/${club.id}/restore`, { method: "POST" })).status).toBe(400);
        });

        it("refuses to delete a club that is not archived", async () => {
            const { request } = await setup();
            const club = await harness.setupClub("Club");
            expect((await request(`/clubs/${club.id}`, { method: "DELETE" })).status).toBe(400);
        });

        it("refuses to delete a club archived less than 7 days ago", async () => {
            const { request } = await setup();
            const club = await harness.setupClub("Club");
            await harness.db.update(clubsTable)
                .set({ archivedAt: new Date(Date.now() - 6 * DAY_MS) })
                .where(eq(clubsTable.id, club.id));

            expect((await request(`/clubs/${club.id}`, { method: "DELETE" })).status).toBe(400);
            expect(await harness.db.query.clubsTable.findFirst({ where: { id: club.id } })).toBeTruthy();
        });

        it("permanently deletes a club and its data, leaving other clubs alone", async () => {
            const { request } = await setup();
            const club = await harness.setupClub("Doomed");
            const other = await harness.setupClub("Safe");
            const { user } = await harness.setupUser("member@test.com", "admin", club.id);
            const { user: otherUser } = await harness.setupUser("other@test.com", "admin", other.id);

            const makeEvent = async (clubId: number, createdBy: number) => {
                const [event] = await harness.db.insert(eventsTable).values({
                    name: "Event", location: "Venue", clubId, start: new Date(), end: new Date()
                }).returning();
                const [task] = await harness.db.insert(tasksTable).values({
                    eventId: event!.id, title: "Task", description: "d", createdBy
                }).returning();
                await harness.db.insert(taskAssignmentsTable).values({ taskId: task!.id, userId: createdBy });
                return event!;
            };
            await makeEvent(club.id, user.id);
            const safeEvent = await makeEvent(other.id, otherUser.id);

            await harness.db.update(clubsTable)
                .set({ archivedAt: new Date(Date.now() - 8 * DAY_MS) })
                .where(eq(clubsTable.id, club.id));

            expect((await request(`/clubs/${club.id}`, { method: "DELETE" })).status).toBe(204);

            expect(await harness.db.query.clubsTable.findFirst({ where: { id: club.id } })).toBeUndefined();
            expect(await harness.db.select().from(usersTable).where(eq(usersTable.clubId, club.id))).toHaveLength(0);
            expect(await harness.db.select().from(eventsTable).where(eq(eventsTable.clubId, club.id))).toHaveLength(0);
            expect(await harness.db.select().from(tasksTable)).toHaveLength(1);
            expect(await harness.db.select().from(taskAssignmentsTable)).toHaveLength(1);
            expect(await harness.db.query.eventsTable.findFirst({ where: { id: safeEvent.id } })).toBeTruthy();
            expect(await harness.db.query.usersTable.findFirst({ where: { email: "root@test.com" } })).toBeTruthy();
        });

        it("returns 404 for an unknown club", async () => {
            const { request } = await setup();
            expect((await request("/clubs/9999/users")).status).toBe(404);
        });
    });

    describe("accounts", () => {
        const newAccount = { name: "New Person", email: "new@test.com", role: "exec", password: "password123" };

        it("creates an account in the chosen club with a hashed password", async () => {
            const { request } = await setup();
            const club = await harness.setupClub("Club");

            const res = await request(`/clubs/${club.id}/users`, { method: "POST", body: newAccount });
            expect(res.status).toBe(201);
            const body = await res.json() as Record<string, unknown>;
            expect(body).toMatchObject({ name: "New Person", email: "new@test.com", role: "exec", clubId: club.id });
            expect(body.password).toBeUndefined();

            const stored = await harness.db.query.usersTable.findFirst({ where: { email: "new@test.com" } });
            expect(stored!.password).not.toBe("password123");
        });

        it.each([
            ["a duplicate email", { email: "root@test.com" }],
            ["a short password", { password: "short" }],
            ["the superadmin role", { role: "superadmin" }],
            ["an invalid email", { email: "nope" }]
        ])("rejects %s", async (_label, override) => {
            const { request } = await setup();
            const club = await harness.setupClub("Club");
            const res = await request(`/clubs/${club.id}/users`, { method: "POST", body: { ...newAccount, ...override } });
            expect(res.status).toBe(400);
        });

        it("lists the accounts of a club without passwords", async () => {
            const { request } = await setup();
            const club = await harness.setupClub("Club");
            const other = await harness.setupClub("Other");
            await harness.setupUser("a@test.com", "admin", club.id);
            await harness.setupUser("b@test.com", "admin", other.id);

            const list = await (await request(`/clubs/${club.id}/users`)).json() as Record<string, unknown>[];
            expect(list).toHaveLength(1);
            expect(list[0]!.email).toBe("a@test.com");
            expect(list[0]!.password).toBeUndefined();
        });

        it("updates name, email and role, and optionally the password", async () => {
            const { request } = await setup();
            const club = await harness.setupClub("Club");
            const { user } = await harness.setupUser("a@test.com", "standard", club.id);

            const res = await request(`/users/${user.id}`, {
                method: "PUT", body: { name: "Renamed", email: "renamed@test.com", role: "admin" }
            });
            expect(res.status).toBe(200);
            let stored = await harness.db.query.usersTable.findFirst({ where: { id: user.id } });
            expect(stored).toMatchObject({ name: "Renamed", email: "renamed@test.com", role: "admin", password: "_" });

            await request(`/users/${user.id}`, {
                method: "PUT", body: { name: "Renamed", email: "renamed@test.com", role: "admin", password: "newpassword1" }
            });
            stored = await harness.db.query.usersTable.findFirst({ where: { id: user.id } });
            expect(stored!.password).not.toBe("_");
        });

        it("will not edit, offboard or remove a super admin", async () => {
            const { request } = await setup();
            const { user: other } = await harness.setupUser("root2@test.com", "superadmin", null, "Root 2");

            expect((await request(`/users/${other.id}`, {
                method: "PUT", body: { name: "x", email: "x@test.com", role: "standard" }
            })).status).toBe(404);
            expect((await request(`/users/${other.id}/offboard`, { method: "POST" })).status).toBe(404);
            expect((await request(`/users/${other.id}`, { method: "DELETE" })).status).toBe(404);
        });

        it("offboards an account, unassigning their tasks, then reactivates it", async () => {
            const { request } = await setup();
            const club = await harness.setupClub("Club");
            const { user } = await harness.setupUser("a@test.com", "standard", club.id);
            const [event] = await harness.db.insert(eventsTable).values({
                name: "E", location: "V", clubId: club.id, start: new Date(), end: new Date()
            }).returning();
            const [task] = await harness.db.insert(tasksTable).values({
                eventId: event!.id, title: "T", description: "d", createdBy: user.id
            }).returning();
            await harness.db.insert(taskAssignmentsTable).values({ taskId: task!.id, userId: user.id });

            const res = await request(`/users/${user.id}/offboard`, { method: "POST" });
            expect(res.status).toBe(200);
            expect((await res.json() as { unassignedTasks: unknown[] }).unassignedTasks).toHaveLength(1);
            expect((await harness.db.query.usersTable.findFirst({ where: { id: user.id } }))!.status).toBe("offboarded");
            expect(await harness.db.select().from(taskAssignmentsTable)).toHaveLength(0);
            expect((await request(`/users/${user.id}/offboard`, { method: "POST" })).status).toBe(400);

            expect((await request(`/users/${user.id}/reactivate`, { method: "POST" })).status).toBe(200);
            expect((await harness.db.query.usersTable.findFirst({ where: { id: user.id } }))!.status).toBe("active");
            expect((await request(`/users/${user.id}/reactivate`, { method: "POST" })).status).toBe(400);
        });

        it("removes an account with no history", async () => {
            const { request } = await setup();
            const club = await harness.setupClub("Club");
            const { user } = await harness.setupUser("a@test.com", "standard", club.id);

            expect((await request(`/users/${user.id}`, { method: "DELETE" })).status).toBe(204);
            expect(await harness.db.query.usersTable.findFirst({ where: { id: user.id } })).toBeUndefined();
        });

        it("refuses to remove an account that authored records", async () => {
            const { request } = await setup();
            const club = await harness.setupClub("Club");
            const { user } = await harness.setupUser("a@test.com", "standard", club.id);
            const [event] = await harness.db.insert(eventsTable).values({
                name: "E", location: "V", clubId: club.id, start: new Date(), end: new Date()
            }).returning();
            await harness.db.insert(tasksTable).values({
                eventId: event!.id, title: "T", description: "d", createdBy: user.id
            });

            expect((await request(`/users/${user.id}`, { method: "DELETE" })).status).toBe(409);
            expect(await harness.db.query.usersTable.findFirst({ where: { id: user.id } })).toBeTruthy();
        });
    });
});
