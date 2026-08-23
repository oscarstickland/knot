import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect } from "bun:test";
import { type TestDatabaseHarness, setupHarness } from "../harness.ts";
import { usersTable } from "../../db/schema.ts";
import { verifyPassword } from "../../services/auth.ts";

describe("User Admin Settings Integration Test", () => {
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

    describe("POST /api/user (create)", () => {
        it.each(["standard", "exec"])("prevents %s users from creating a user", async (role) => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("actor@test.com", role, club.id, "Actor");

            const res = await app.request("/api/user", {
                method: "POST",
                headers: { cookie },
                body: JSON.stringify({
                    name: "New Member", email: "new@test.com", role: "standard", password: "password123"
                })
            });
            expect(res.status).toBe(403);
        });

        it("allows an admin to create a new user in their own club", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");

            const res = await app.request("/api/user", {
                method: "POST",
                headers: { cookie },
                body: JSON.stringify({
                    name: "New Member", email: "new@test.com", role: "standard", password: "password123"
                })
            });
            expect(res.status).toBe(201);

            const created = await harness.db.query.usersTable.findFirst({
                where: { email: "new@test.com" }
            });
            expect(created).not.toBeUndefined();
            expect(created!.clubId).toBe(club.id);
            expect(created!.role).toBe("standard");
            expect(await verifyPassword("password123", created!.password)).toBe(true);
        });

        it("prevents creating a user with the admin role", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");

            const res = await app.request("/api/user", {
                method: "POST",
                headers: { cookie },
                body: JSON.stringify({
                    name: "New Member", email: "new@test.com", role: "admin", password: "password123"
                })
            });
            expect(res.status).toBe(400);

            const created = await harness.db.query.usersTable.findFirst({
                where: { email: "new@test.com" }
            });
            expect(created).toBeUndefined();
        });

        it("prevents creating a user with an email already in use", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            await harness.setupUser("existing@test.com", "standard", club.id, "Existing");

            const res = await app.request("/api/user", {
                method: "POST",
                headers: { cookie },
                body: JSON.stringify({
                    name: "New Member", email: "existing@test.com", role: "standard", password: "password123"
                })
            });
            expect(res.status).toBe(400);
        });
    });

    describe("PUT /api/user/:id (update)", () => {
        it.each(["standard", "exec"])("prevents %s users from editing a member", async (role) => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("actor@test.com", role, club.id, "Actor");
            const { user: target } = await harness.setupUser("target@test.com", "standard", club.id, "Target");

            const res = await app.request(`/api/user/${target.id}`, {
                method: "PUT",
                headers: { cookie },
                body: JSON.stringify({
                    name: "Updated", email: "target@test.com", role: "standard"
                })
            });
            expect(res.status).toBe(403);
        });

        it.each(["standard", "exec"])("allows an admin to edit a %s member", async (targetRole) => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const { user: target } = await harness.setupUser("target@test.com", targetRole, club.id, "Target");

            const res = await app.request(`/api/user/${target.id}`, {
                method: "PUT",
                headers: { cookie },
                body: JSON.stringify({
                    name: "Updated Name", email: "target@test.com", role: targetRole
                })
            });
            expect(res.status).toBe(200);

            const updated = await harness.db.query.usersTable.findFirst({ where: { id: target.id } });
            expect(updated!.name).toBe("Updated Name");
        });

        it("prevents an admin from editing another admin", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const { user: otherAdmin } = await harness.setupUser("other-admin@test.com", "admin", club.id, "Other Admin");

            const res = await app.request(`/api/user/${otherAdmin.id}`, {
                method: "PUT",
                headers: { cookie },
                body: JSON.stringify({
                    name: "Hacked", email: "other-admin@test.com", role: "standard"
                })
            });
            expect(res.status).toBe(400);

            const unchanged = await harness.db.query.usersTable.findFirst({ where: { id: otherAdmin.id } });
            expect(unchanged!.name).toBe("Other Admin");
            expect(unchanged!.role).toBe("admin");
        });

        it("prevents promoting a member to admin", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const { user: target } = await harness.setupUser("target@test.com", "standard", club.id, "Target");

            const res = await app.request(`/api/user/${target.id}`, {
                method: "PUT",
                headers: { cookie },
                body: JSON.stringify({
                    name: "Target", email: "target@test.com", role: "admin"
                })
            });
            expect(res.status).toBe(400);

            const unchanged = await harness.db.query.usersTable.findFirst({ where: { id: target.id } });
            expect(unchanged!.role).toBe("standard");
        });

        it("prevents editing a member from another club", async () => {
            const app = await harness.setupApp();
            const club1 = await harness.setupClub("Club1");
            const club2 = await harness.setupClub("Club2");
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club1.id, "Admin");
            const { user: target } = await harness.setupUser("target@test.com", "standard", club2.id, "Target");

            const res = await app.request(`/api/user/${target.id}`, {
                method: "PUT",
                headers: { cookie },
                body: JSON.stringify({
                    name: "Hacked", email: "target@test.com", role: "standard"
                })
            });
            expect(res.status).toBe(404);
        });
    });

    describe("DELETE /api/user/:id (delete)", () => {
        it.each(["standard", "exec"])("prevents %s users from deleting a member", async (role) => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("actor@test.com", role, club.id, "Actor");
            const { user: target } = await harness.setupUser("target@test.com", "standard", club.id, "Target");

            const res = await app.request(`/api/user/${target.id}`, {
                method: "DELETE",
                headers: { cookie }
            });
            expect(res.status).toBe(403);
        });

        it.each(["standard", "exec"])("allows an admin to delete a %s member", async (targetRole) => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const { user: target } = await harness.setupUser("target@test.com", targetRole, club.id, "Target");

            const res = await app.request(`/api/user/${target.id}`, {
                method: "DELETE",
                headers: { cookie }
            });
            expect(res.status).toBe(204);

            const deleted = await harness.db.query.usersTable.findFirst({ where: { id: target.id } });
            expect(deleted).toBeUndefined();
        });

        it("prevents an admin from deleting another admin", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const { user: otherAdmin } = await harness.setupUser("other-admin@test.com", "admin", club.id, "Other Admin");

            const res = await app.request(`/api/user/${otherAdmin.id}`, {
                method: "DELETE",
                headers: { cookie }
            });
            expect(res.status).toBe(400);

            const stillExists = await harness.db.query.usersTable.findFirst({ where: { id: otherAdmin.id } });
            expect(stillExists).not.toBeUndefined();
        });

        it("prevents deleting a member from another club", async () => {
            const app = await harness.setupApp();
            const club1 = await harness.setupClub("Club1");
            const club2 = await harness.setupClub("Club2");
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club1.id, "Admin");
            const { user: target } = await harness.setupUser("target@test.com", "standard", club2.id, "Target");

            const res = await app.request(`/api/user/${target.id}`, {
                method: "DELETE",
                headers: { cookie }
            });
            expect(res.status).toBe(404);

            const stillExists = await harness.db.query.usersTable.findFirst({ where: { id: target.id } });
            expect(stillExists).not.toBeUndefined();
        });
    });

    describe("PATCH /api/user/bulk-role (bulk role update)", () => {
        it.each(["standard", "exec"])("prevents %s users from bulk updating roles", async (role) => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("actor@test.com", role, club.id, "Actor");
            const { user: target } = await harness.setupUser("target@test.com", "standard", club.id, "Target");

            const res = await app.request("/api/user/bulk-role", {
                method: "PATCH",
                headers: { cookie },
                body: JSON.stringify({ ids: [target.id], role: "exec" })
            });
            expect(res.status).toBe(403);
        });

        it("allows an admin to bulk update the roles of standard/exec members", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const { user: target1 } = await harness.setupUser("target1@test.com", "standard", club.id, "Target1");
            const { user: target2 } = await harness.setupUser("target2@test.com", "standard", club.id, "Target2");

            const res = await app.request("/api/user/bulk-role", {
                method: "PATCH",
                headers: { cookie },
                body: JSON.stringify({ ids: [target1.id, target2.id], role: "exec" })
            });
            expect(res.status).toBe(200);

            const updated1 = await harness.db.query.usersTable.findFirst({ where: { id: target1.id } });
            const updated2 = await harness.db.query.usersTable.findFirst({ where: { id: target2.id } });
            expect(updated1!.role).toBe("exec");
            expect(updated2!.role).toBe("exec");
        });

        it("does not update an admin's role even when included in the bulk selection", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const { user: otherAdmin } = await harness.setupUser("other-admin@test.com", "admin", club.id, "Other Admin");
            const { user: target } = await harness.setupUser("target@test.com", "standard", club.id, "Target");

            const res = await app.request("/api/user/bulk-role", {
                method: "PATCH",
                headers: { cookie },
                body: JSON.stringify({ ids: [otherAdmin.id, target.id], role: "exec" })
            });
            expect(res.status).toBe(200);

            const unchangedAdmin = await harness.db.query.usersTable.findFirst({ where: { id: otherAdmin.id } });
            const updatedTarget = await harness.db.query.usersTable.findFirst({ where: { id: target.id } });
            expect(unchangedAdmin!.role).toBe("admin");
            expect(updatedTarget!.role).toBe("exec");
        });

        it("prevents bulk promoting members to admin", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const { user: target } = await harness.setupUser("target@test.com", "standard", club.id, "Target");

            const res = await app.request("/api/user/bulk-role", {
                method: "PATCH",
                headers: { cookie },
                body: JSON.stringify({ ids: [target.id], role: "admin" })
            });
            expect(res.status).toBe(400);

            const unchanged = await harness.db.query.usersTable.findFirst({ where: { id: target.id } });
            expect(unchanged!.role).toBe("standard");
        });

        it("does not update roles for users belonging to another club", async () => {
            const app = await harness.setupApp();
            const club1 = await harness.setupClub("Club1");
            const club2 = await harness.setupClub("Club2");
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club1.id, "Admin");
            const { user: target } = await harness.setupUser("target@test.com", "standard", club2.id, "Target");

            const res = await app.request("/api/user/bulk-role", {
                method: "PATCH",
                headers: { cookie },
                body: JSON.stringify({ ids: [target.id], role: "exec" })
            });
            expect(res.status).toBe(200);

            const unchanged = await harness.db.query.usersTable.findFirst({ where: { id: target.id } });
            expect(unchanged!.role).toBe("standard");
        });
    });

    describe("POST /api/user/bulk-delete (bulk delete)", () => {
        it.each(["standard", "exec"])("prevents %s users from bulk deleting members", async (role) => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("actor@test.com", role, club.id, "Actor");
            const { user: target } = await harness.setupUser("target@test.com", "standard", club.id, "Target");

            const res = await app.request("/api/user/bulk-delete", {
                method: "POST",
                headers: { cookie },
                body: JSON.stringify({ ids: [target.id] })
            });
            expect(res.status).toBe(403);
        });

        it("allows an admin to bulk delete standard/exec members", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const { user: target1 } = await harness.setupUser("target1@test.com", "standard", club.id, "Target1");
            const { user: target2 } = await harness.setupUser("target2@test.com", "exec", club.id, "Target2");

            const res = await app.request("/api/user/bulk-delete", {
                method: "POST",
                headers: { cookie },
                body: JSON.stringify({ ids: [target1.id, target2.id] })
            });
            expect(res.status).toBe(200);

            const remaining = await harness.db.query.usersTable.findMany({
                where: { id: { in: [target1.id, target2.id] } }
            });
            expect(remaining.length).toBe(0);
        });

        it("does not delete an admin even when included in the bulk selection", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const { user: otherAdmin } = await harness.setupUser("other-admin@test.com", "admin", club.id, "Other Admin");
            const { user: target } = await harness.setupUser("target@test.com", "standard", club.id, "Target");

            const res = await app.request("/api/user/bulk-delete", {
                method: "POST",
                headers: { cookie },
                body: JSON.stringify({ ids: [otherAdmin.id, target.id] })
            });
            expect(res.status).toBe(200);

            const adminStillExists = await harness.db.query.usersTable.findFirst({ where: { id: otherAdmin.id } });
            const targetDeleted = await harness.db.query.usersTable.findFirst({ where: { id: target.id } });
            expect(adminStillExists).not.toBeUndefined();
            expect(targetDeleted).toBeUndefined();
        });

        it("does not delete users belonging to another club", async () => {
            const app = await harness.setupApp();
            const club1 = await harness.setupClub("Club1");
            const club2 = await harness.setupClub("Club2");
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club1.id, "Admin");
            const { user: target } = await harness.setupUser("target@test.com", "standard", club2.id, "Target");

            const res = await app.request("/api/user/bulk-delete", {
                method: "POST",
                headers: { cookie },
                body: JSON.stringify({ ids: [target.id] })
            });
            expect(res.status).toBe(200);

            const stillExists = await harness.db.query.usersTable.findFirst({ where: { id: target.id } });
            expect(stillExists).not.toBeUndefined();
        });
    });
});
