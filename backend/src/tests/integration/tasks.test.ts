import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect } from "bun:test";
import { type TestDatabaseHarness, setupHarness } from "../harness.ts";
import { eventsTable, tasksTable, taskAssignmentsTable, taskDependenciesTable } from "../../db/schema.ts";
import type { Task } from "../../types/tasks.ts";

type HTTPError = {
    message: string
}

describe("Task Integration Test", () => {
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

    async function setupTask(eventId: number, createdBy: number, title: string = "Task", progress: "backlog" | "in_progress" | "in_review" | "completed" = "backlog") {
        const [task] = await harness.db
            .insert(tasksTable)
            .values({ eventId, title, description: "Description", createdBy, progress })
            .returning();
        if (!task) throw new Error("Task returned is null");
        return task;
    }

    async function setupDependency(taskId: number, dependsOnTaskId: number) {
        await harness.db.insert(taskDependenciesTable).values({ taskId, dependsOnTaskId });
    }

    async function assignUser(taskId: number, userId: number) {
        await harness.db.insert(taskAssignmentsTable).values({ taskId, userId });
    }

    describe("POST /api/tasks (create)", () => {
        it("prevents standard users from creating a task", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { cookie } = await harness.setupUser("standard@test.com", "standard", club.id, "Standard");

            const res = await app.request("/api/tasks", {
                method: "POST",
                headers: { cookie },
                body: JSON.stringify({
                    eventId: event.id, title: "Task", description: "Description", priority: "medium",
                    assigneeIds: [], dependencyIds: []
                })
            });
            expect(res.status).toBe(403);
        });

        it.each(["exec", "admin"])("allows %s to create a task", async (role) => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { cookie } = await harness.setupUser("actor@test.com", role, club.id, "Actor");

            const res = await app.request("/api/tasks", {
                method: "POST",
                headers: { cookie },
                body: JSON.stringify({
                    eventId: event.id, title: "Task", description: "Description", priority: "medium",
                    assigneeIds: [], dependencyIds: []
                })
            });
            expect(res.status).toBe(201);

            const created = await harness.db.query.tasksTable.findFirst({ where: { eventId: event.id } });
            expect(created).not.toBeUndefined();
            expect(created!.progress).toBe("backlog");
        });

        it("prevents assigning a user who is not a member of the club", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const otherClub = await harness.setupClub("Other Club");
            const event = await setupEvent(club.id);
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const { user: outsider } = await harness.setupUser("outsider@test.com", "standard", otherClub.id, "Outsider");

            const res = await app.request("/api/tasks", {
                method: "POST",
                headers: { cookie },
                body: JSON.stringify({
                    eventId: event.id, title: "Task", description: "Description", priority: "medium",
                    assigneeIds: [outsider.id], dependencyIds: []
                })
            });
            expect(res.status).toBe(400);
        });

        it("prevents depending on a task from a different event", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const otherEvent = await setupEvent(club.id);
            const { user: admin, cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const foreignTask = await setupTask(otherEvent.id, admin.id, "Foreign Task");

            const res = await app.request("/api/tasks", {
                method: "POST",
                headers: { cookie },
                body: JSON.stringify({
                    eventId: event.id, title: "Task", description: "Description", priority: "medium",
                    assigneeIds: [], dependencyIds: [foreignTask.id]
                })
            });
            expect(res.status).toBe(400);
        });

        it("creates a task with valid assignees and dependencies", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: admin, cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const { user: member } = await harness.setupUser("member@test.com", "standard", club.id, "Member");
            const dependency = await setupTask(event.id, admin.id, "Dependency");

            const res = await app.request("/api/tasks", {
                method: "POST",
                headers: { cookie },
                body: JSON.stringify({
                    eventId: event.id, title: "Task", description: "Description", priority: "high",
                    assigneeIds: [member.id], dependencyIds: [dependency.id]
                })
            });
            expect(res.status).toBe(201);
            const body = await res.json() as Task;

            const assignments = await harness.db.query.taskAssignmentsTable.findMany({ where: { taskId: body.id } });
            const dependencies = await harness.db.query.taskDependenciesTable.findMany({ where: { taskId: body.id } });
            expect(assignments.map((a) => a.userId)).toEqual([member.id]);
            expect(dependencies.map((d) => d.dependsOnTaskId)).toEqual([dependency.id]);
        });
    });

    describe("PUT /api/tasks/:id (update)", () => {
        it("prevents standard users from updating a task", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: admin } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const { cookie } = await harness.setupUser("standard@test.com", "standard", club.id, "Standard");
            const task = await setupTask(event.id, admin.id);

            const res = await app.request(`/api/tasks/${task.id}`, {
                method: "PUT",
                headers: { cookie },
                body: JSON.stringify({
                    eventId: event.id, title: "Updated", description: "Description", priority: "medium",
                    assigneeIds: [], dependencyIds: []
                })
            });
            expect(res.status).toBe(403);
        });

        it("prevents moving a task to a different event", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const otherEvent = await setupEvent(club.id);
            const { user: admin, cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const task = await setupTask(event.id, admin.id);

            const res = await app.request(`/api/tasks/${task.id}`, {
                method: "PUT",
                headers: { cookie },
                body: JSON.stringify({
                    eventId: otherEvent.id, title: "Updated", description: "Description", priority: "medium",
                    assigneeIds: [], dependencyIds: []
                })
            });
            expect(res.status).toBe(400);
        });

        it("prevents a task from depending on itself", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: admin, cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const task = await setupTask(event.id, admin.id);

            const res = await app.request(`/api/tasks/${task.id}`, {
                method: "PUT",
                headers: { cookie },
                body: JSON.stringify({
                    eventId: event.id, title: "Task", description: "Description", priority: "medium",
                    assigneeIds: [], dependencyIds: [task.id]
                })
            });
            expect(res.status).toBe(400);
        });

        it("prevents creating a circular dependency between tasks", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: admin, cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");

            // taskA has no dependencies, taskB depends on taskA
            const taskA = await setupTask(event.id, admin.id, "Task A");
            const taskB = await setupTask(event.id, admin.id, "Task B");
            await setupDependency(taskB.id, taskA.id);

            // now attempt to make taskA depend on taskB, which would create a cycle
            const res = await app.request(`/api/tasks/${taskA.id}`, {
                method: "PUT",
                headers: { cookie },
                body: JSON.stringify({
                    eventId: event.id, title: "Task A", description: "Description", priority: "medium",
                    assigneeIds: [], dependencyIds: [taskB.id]
                })
            });
            expect(res.status).toBe(400);
        });

        it.each(["exec", "admin"])("allows %s to update a task's dependencies and assignees", async (role) => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: actor, cookie } = await harness.setupUser("actor@test.com", role, club.id, "Actor");
            const { user: member } = await harness.setupUser("member@test.com", "standard", club.id, "Member");
            const dependency = await setupTask(event.id, actor.id, "Dependency");
            const task = await setupTask(event.id, actor.id, "Task");

            const res = await app.request(`/api/tasks/${task.id}`, {
                method: "PUT",
                headers: { cookie },
                body: JSON.stringify({
                    eventId: event.id, title: "Task Updated", description: "Description", priority: "low",
                    assigneeIds: [member.id], dependencyIds: [dependency.id]
                })
            });
            expect(res.status).toBe(200);

            const assignments = await harness.db.query.taskAssignmentsTable.findMany({ where: { taskId: task.id } });
            const dependencies = await harness.db.query.taskDependenciesTable.findMany({ where: { taskId: task.id } });
            expect(assignments.map((a) => a.userId)).toEqual([member.id]);
            expect(dependencies.map((d) => d.dependsOnTaskId)).toEqual([dependency.id]);
        });
    });

    describe("GET /api/tasks/me", () => {
        it("returns an empty list for a user with no assignments", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: admin, cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            await setupTask(event.id, admin.id, "Unassigned Task");

            const res = await app.request("/api/tasks/me", { headers: { cookie } });
            expect(res.status).toBe(200);
            const body = await res.json() as Task[];
            expect(body).toEqual([]);
        });

        it("only returns tasks explicitly assigned to the requesting user", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: admin } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const { user: member, cookie } = await harness.setupUser("member@test.com", "standard", club.id, "Member");
            const { user: other } = await harness.setupUser("other@test.com", "standard", club.id, "Other");

            const assignedTask = await setupTask(event.id, admin.id, "Assigned To Me");
            await assignUser(assignedTask.id, member.id);

            const othersTask = await setupTask(event.id, admin.id, "Assigned To Someone Else");
            await assignUser(othersTask.id, other.id);

            await setupTask(event.id, admin.id, "Unassigned Task");

            const res = await app.request("/api/tasks/me", { headers: { cookie } });
            expect(res.status).toBe(200);
            const body = await res.json() as Task[];
            expect(body.map((task) => task.id)).toEqual([assignedTask.id]);
        });

        it("does not return tasks assigned to a different user in the same club", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: admin } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const { cookie } = await harness.setupUser("member@test.com", "standard", club.id, "Member");
            const { user: other } = await harness.setupUser("other@test.com", "standard", club.id, "Other");

            const othersTask = await setupTask(event.id, admin.id, "Assigned To Someone Else");
            await assignUser(othersTask.id, other.id);

            const res = await app.request("/api/tasks/me", { headers: { cookie } });
            expect(res.status).toBe(200);
            const body = await res.json() as Task[];
            expect(body).toEqual([]);
        });

        it("does not return tasks from a different club", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const otherClub = await harness.setupClub("Other Club");
            const otherEvent = await setupEvent(otherClub.id);
            const { user: otherAdmin } = await harness.setupUser("other-admin@test.com", "admin", otherClub.id, "Other Admin");
            const { cookie } = await harness.setupUser("member@test.com", "standard", club.id, "Member");

            const foreignTask = await setupTask(otherEvent.id, otherAdmin.id, "Foreign Task");
            await assignUser(foreignTask.id, otherAdmin.id);

            const res = await app.request("/api/tasks/me", { headers: { cookie } });
            expect(res.status).toBe(200);
            const body = await res.json() as Task[];
            expect(body).toEqual([]);
        });
    });

    describe("PATCH /api/tasks/:id/progress (dependency-aware completion)", () => {
        it("prevents completing a task while a task it depends on is incomplete", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: admin, cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");

            const dependency = await setupTask(event.id, admin.id, "Prerequisite Task", "backlog");
            const task = await setupTask(event.id, admin.id, "Dependent Task", "in_progress");
            await setupDependency(task.id, dependency.id);

            const res = await app.request(`/api/tasks/${task.id}/progress`, {
                method: "PATCH",
                headers: { cookie },
                body: JSON.stringify({ progress: "completed" })
            });
            expect(res.status).toBe(400);
            const body = await res.json() as HTTPError;
            expect(body.message).toContain("Prerequisite Task");

            const unchanged = await harness.db.query.tasksTable.findFirst({ where: { id: task.id } });
            expect(unchanged!.progress).toBe("in_progress");
        });

        it("allows completing a task once every task it depends on is completed", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: admin, cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");

            const dependency = await setupTask(event.id, admin.id, "Prerequisite Task", "completed");
            const task = await setupTask(event.id, admin.id, "Dependent Task", "in_progress");
            await setupDependency(task.id, dependency.id);

            const res = await app.request(`/api/tasks/${task.id}/progress`, {
                method: "PATCH",
                headers: { cookie },
                body: JSON.stringify({ progress: "completed" })
            });
            expect(res.status).toBe(200);

            const updated = await harness.db.query.tasksTable.findFirst({ where: { id: task.id } });
            expect(updated!.progress).toBe("completed");
        });

        it("prevents completing a task if only some of its multiple dependencies are completed", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: admin, cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");

            const dependencyOne = await setupTask(event.id, admin.id, "Dependency One", "completed");
            const dependencyTwo = await setupTask(event.id, admin.id, "Dependency Two", "backlog");
            const task = await setupTask(event.id, admin.id, "Task", "in_progress");
            await setupDependency(task.id, dependencyOne.id);
            await setupDependency(task.id, dependencyTwo.id);

            const res = await app.request(`/api/tasks/${task.id}/progress`, {
                method: "PATCH",
                headers: { cookie },
                body: JSON.stringify({ progress: "completed" })
            });
            expect(res.status).toBe(400);
            const body = await res.json() as HTTPError;
            expect(body.message).toContain("Dependency Two");
            expect(body.message).not.toContain("Dependency One");
        });

        it("allows completing a task with no dependencies", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: admin, cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const task = await setupTask(event.id, admin.id, "Standalone Task", "in_progress");

            const res = await app.request(`/api/tasks/${task.id}/progress`, {
                method: "PATCH",
                headers: { cookie },
                body: JSON.stringify({ progress: "completed" })
            });
            expect(res.status).toBe(200);
        });

        it("does not block moving a task to a non-completed progress state when dependencies are incomplete", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: admin, cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");

            const dependency = await setupTask(event.id, admin.id, "Prerequisite Task", "backlog");
            const task = await setupTask(event.id, admin.id, "Dependent Task", "backlog");
            await setupDependency(task.id, dependency.id);

            const res = await app.request(`/api/tasks/${task.id}/progress`, {
                method: "PATCH",
                headers: { cookie },
                body: JSON.stringify({ progress: "in_review" })
            });
            expect(res.status).toBe(200);
        });

        it("allows an assigned standard user to update their task's progress", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: admin } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const { user: member, cookie } = await harness.setupUser("member@test.com", "standard", club.id, "Member");
            const task = await setupTask(event.id, admin.id, "Task", "backlog");
            await assignUser(task.id, member.id);

            const res = await app.request(`/api/tasks/${task.id}/progress`, {
                method: "PATCH",
                headers: { cookie },
                body: JSON.stringify({ progress: "in_progress" })
            });
            expect(res.status).toBe(200);
        });

        it("prevents an unassigned standard user from updating a task's progress", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: admin } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const { cookie } = await harness.setupUser("bystander@test.com", "standard", club.id, "Bystander");
            const task = await setupTask(event.id, admin.id, "Task", "backlog");

            const res = await app.request(`/api/tasks/${task.id}/progress`, {
                method: "PATCH",
                headers: { cookie },
                body: JSON.stringify({ progress: "in_progress" })
            });
            expect(res.status).toBe(403);
        });

        it("prevents updating progress for a task belonging to another club", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const otherClub = await harness.setupClub("Other Club");
            const event = await setupEvent(otherClub.id);
            const { user: otherAdmin } = await harness.setupUser("other-admin@test.com", "admin", otherClub.id, "Other Admin");
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const task = await setupTask(event.id, otherAdmin.id, "Task", "backlog");

            const res = await app.request(`/api/tasks/${task.id}/progress`, {
                method: "PATCH",
                headers: { cookie },
                body: JSON.stringify({ progress: "in_progress" })
            });
            expect(res.status).toBe(404);
        });
    });
});
