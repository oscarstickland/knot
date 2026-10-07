import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect } from "bun:test";
import { type TestDatabaseHarness, setupHarness } from "../harness.ts";
import { eventsTable, taskCommentsTable, tasksTable } from "../../db/schema.ts";
import type { TaskCommentWithAuthor } from "../../types/tasks.ts";

describe("Task Comments Integration Test", () => {
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

    async function setupEvent(clubId: number) {
        const referenceDate = new Date();
        const [event] = await harness.db
            .insert(eventsTable)
            .values({ name: "Event", location: "Main Hall", start: referenceDate, end: new Date(referenceDate.valueOf() + 5000), clubId })
            .returning();
        if (!event) throw new Error("Event returned is null");
        return event;
    }

    async function setupTask(eventId: number, createdBy: number, title: string = "Task") {
        const [task] = await harness.db
            .insert(tasksTable)
            .values({ eventId, title, description: "Description", createdBy })
            .returning();
        if (!task) throw new Error("Task returned is null");
        return task;
    }

    async function setupComment(taskId: number, authorId: number, body: string = "Comment", createdAt: Date = new Date()) {
        const [comment] = await harness.db
            .insert(taskCommentsTable)
            .values({ taskId, authorId, body, createdAt })
            .returning();
        if (!comment) throw new Error("Comment returned is null");
        return comment;
    }

    describe("POST /api/tasks/:id/comments (create)", () => {
        it.each(["standard", "exec", "admin"] as const)("allows %s to comment on a task", async (role) => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: creator } = await harness.setupUser("creator@test.com", "admin", club.id, "Creator");
            const { user: actor, cookie } = await harness.setupUser("actor@test.com", role, club.id, "Actor");
            const task = await setupTask(event.id, creator.id);

            const res = await app.request(`/api/tasks/${task.id}/comments`, {
                method: "POST",
                headers: { cookie },
                body: JSON.stringify({ body: "  How is this going?  " })
            });
            expect(res.status).toBe(201);

            const body = await res.json() as TaskCommentWithAuthor;
            expect(body.author).toEqual({ id: actor.id, name: "Actor" });

            const stored = await harness.db.query.taskCommentsTable.findFirst({ where: { taskId: task.id } });
            expect(stored).not.toBeUndefined();
            expect(stored!.authorId).toBe(actor.id);
            expect(stored!.body).toBe("How is this going?");
            expect(stored!.updatedAt).toBeNull();
        });

        it("prevents commenting on a task from another club", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const otherClub = await harness.setupClub("Other Club");
            const event = await setupEvent(club.id);
            const { user: creator } = await harness.setupUser("creator@test.com", "admin", club.id, "Creator");
            const { cookie } = await harness.setupUser("outsider@test.com", "admin", otherClub.id, "Outsider");
            const task = await setupTask(event.id, creator.id);

            const res = await app.request(`/api/tasks/${task.id}/comments`, {
                method: "POST",
                headers: { cookie },
                body: JSON.stringify({ body: "Hello" })
            });
            expect(res.status).toBe(404);

            const stored = await harness.db.query.taskCommentsTable.findMany({ where: { taskId: task.id } });
            expect(stored.length).toBe(0);
        });

        it("rejects a whitespace-only comment", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user, cookie } = await harness.setupUser("user@test.com", "standard", club.id, "User");
            const task = await setupTask(event.id, user.id);

            const res = await app.request(`/api/tasks/${task.id}/comments`, {
                method: "POST",
                headers: { cookie },
                body: JSON.stringify({ body: "   " })
            });
            expect(res.status).toBe(400);
        });

        it("returns 404 for a task that does not exist", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("user@test.com", "standard", club.id, "User");

            const res = await app.request(`/api/tasks/9999/comments`, {
                method: "POST",
                headers: { cookie },
                body: JSON.stringify({ body: "Hello" })
            });
            expect(res.status).toBe(404);
        });
    });

    describe("GET /api/tasks/:id/comments (list)", () => {
        it("returns comments oldest first with the author's name and no password", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: alice } = await harness.setupUser("alice@test.com", "admin", club.id, "Alice");
            const { user: bob, cookie } = await harness.setupUser("bob@test.com", "standard", club.id, "Bob");
            const task = await setupTask(event.id, alice.id);
            const otherTask = await setupTask(event.id, alice.id, "Other Task");

            const now = Date.now();
            await setupComment(task.id, bob.id, "Second", new Date(now - 1000));
            await setupComment(task.id, alice.id, "First", new Date(now - 5000));
            await setupComment(otherTask.id, alice.id, "Unrelated", new Date(now));

            const res = await app.request(`/api/tasks/${task.id}/comments`, { headers: { cookie } });
            expect(res.status).toBe(200);

            const comments = await res.json() as TaskCommentWithAuthor[];
            expect(comments.map((comment) => comment.body)).toEqual(["First", "Second"]);
            expect(comments[0]!.author).toEqual({ id: alice.id, name: "Alice" });
            expect(comments[1]!.author).toEqual({ id: bob.id, name: "Bob" });
            expect(JSON.stringify(comments)).not.toContain("password");
        });

        it("prevents viewing comments on a task from another club", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const otherClub = await harness.setupClub("Other Club");
            const event = await setupEvent(club.id);
            const { user: creator } = await harness.setupUser("creator@test.com", "admin", club.id, "Creator");
            const { cookie } = await harness.setupUser("outsider@test.com", "admin", otherClub.id, "Outsider");
            const task = await setupTask(event.id, creator.id);
            await setupComment(task.id, creator.id);

            const res = await app.request(`/api/tasks/${task.id}/comments`, { headers: { cookie } });
            expect(res.status).toBe(404);
        });
    });

    describe("PUT /api/tasks/:id/comments/:commentId (edit)", () => {
        it("allows the author to edit their comment and marks it as edited", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user, cookie } = await harness.setupUser("user@test.com", "standard", club.id, "User");
            const task = await setupTask(event.id, user.id);
            const comment = await setupComment(task.id, user.id, "Original");

            const res = await app.request(`/api/tasks/${task.id}/comments/${comment.id}`, {
                method: "PUT",
                headers: { cookie },
                body: JSON.stringify({ body: "Updated" })
            });
            expect(res.status).toBe(200);

            const stored = await harness.db.query.taskCommentsTable.findFirst({ where: { id: comment.id } });
            expect(stored!.body).toBe("Updated");
            expect(stored!.updatedAt).not.toBeNull();
        });

        it.each(["standard", "exec", "admin"] as const)("prevents %s from editing someone else's comment", async (role) => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: author } = await harness.setupUser("author@test.com", "standard", club.id, "Author");
            const { cookie } = await harness.setupUser("actor@test.com", role, club.id, "Actor");
            const task = await setupTask(event.id, author.id);
            const comment = await setupComment(task.id, author.id, "Original");

            const res = await app.request(`/api/tasks/${task.id}/comments/${comment.id}`, {
                method: "PUT",
                headers: { cookie },
                body: JSON.stringify({ body: "Hijacked" })
            });
            expect(res.status).toBe(403);

            const stored = await harness.db.query.taskCommentsTable.findFirst({ where: { id: comment.id } });
            expect(stored!.body).toBe("Original");
        });

        it("returns 404 when the comment belongs to a different task", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user, cookie } = await harness.setupUser("user@test.com", "standard", club.id, "User");
            const task = await setupTask(event.id, user.id);
            const otherTask = await setupTask(event.id, user.id, "Other Task");
            const comment = await setupComment(otherTask.id, user.id, "Original");

            const res = await app.request(`/api/tasks/${task.id}/comments/${comment.id}`, {
                method: "PUT",
                headers: { cookie },
                body: JSON.stringify({ body: "Updated" })
            });
            expect(res.status).toBe(404);
        });
    });

    describe("DELETE /api/tasks/:id/comments/:commentId (delete)", () => {
        it("allows the author to delete their comment", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user, cookie } = await harness.setupUser("user@test.com", "standard", club.id, "User");
            const task = await setupTask(event.id, user.id);
            const comment = await setupComment(task.id, user.id);

            const res = await app.request(`/api/tasks/${task.id}/comments/${comment.id}`, {
                method: "DELETE",
                headers: { cookie }
            });
            expect(res.status).toBe(200);

            const stored = await harness.db.query.taskCommentsTable.findFirst({ where: { id: comment.id } });
            expect(stored).toBeUndefined();
        });

        it.each(["exec", "admin"] as const)("allows %s to delete someone else's comment", async (role) => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: author } = await harness.setupUser("author@test.com", "standard", club.id, "Author");
            const { cookie } = await harness.setupUser("actor@test.com", role, club.id, "Actor");
            const task = await setupTask(event.id, author.id);
            const comment = await setupComment(task.id, author.id);

            const res = await app.request(`/api/tasks/${task.id}/comments/${comment.id}`, {
                method: "DELETE",
                headers: { cookie }
            });
            expect(res.status).toBe(200);

            const stored = await harness.db.query.taskCommentsTable.findFirst({ where: { id: comment.id } });
            expect(stored).toBeUndefined();
        });

        it("prevents a standard user from deleting someone else's comment", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: author } = await harness.setupUser("author@test.com", "admin", club.id, "Author");
            const { cookie } = await harness.setupUser("actor@test.com", "standard", club.id, "Actor");
            const task = await setupTask(event.id, author.id);
            const comment = await setupComment(task.id, author.id);

            const res = await app.request(`/api/tasks/${task.id}/comments/${comment.id}`, {
                method: "DELETE",
                headers: { cookie }
            });
            expect(res.status).toBe(403);

            const stored = await harness.db.query.taskCommentsTable.findFirst({ where: { id: comment.id } });
            expect(stored).not.toBeUndefined();
        });

        it("prevents an admin from another club deleting a comment", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const otherClub = await harness.setupClub("Other Club");
            const event = await setupEvent(club.id);
            const { user: author } = await harness.setupUser("author@test.com", "standard", club.id, "Author");
            const { cookie } = await harness.setupUser("outsider@test.com", "admin", otherClub.id, "Outsider");
            const task = await setupTask(event.id, author.id);
            const comment = await setupComment(task.id, author.id);

            const res = await app.request(`/api/tasks/${task.id}/comments/${comment.id}`, {
                method: "DELETE",
                headers: { cookie }
            });
            expect(res.status).toBe(404);

            const stored = await harness.db.query.taskCommentsTable.findFirst({ where: { id: comment.id } });
            expect(stored).not.toBeUndefined();
        });
    });

    describe("GET /api/tasks (comment count)", () => {
        it("includes the number of comments on each task", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user, cookie } = await harness.setupUser("user@test.com", "standard", club.id, "User");
            const busyTask = await setupTask(event.id, user.id, "Busy");
            const quietTask = await setupTask(event.id, user.id, "Quiet");
            await setupComment(busyTask.id, user.id, "One");
            await setupComment(busyTask.id, user.id, "Two");

            const res = await app.request(`/api/tasks?eventId=${event.id}`, { headers: { cookie } });
            expect(res.status).toBe(200);

            const tasks = await res.json() as { id: number; commentCount: number; comments?: unknown }[];
            const countById = new Map(tasks.map((task) => [task.id, task.commentCount]));
            expect(countById.get(busyTask.id)).toBe(2);
            expect(countById.get(quietTask.id)).toBe(0);
            expect(tasks.every((task) => task.comments === undefined)).toBe(true);
        });
    });
});
