import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect } from "bun:test";
import { type TestDatabaseHarness, setupHarness } from "../harness.ts";
import {
    budgetCategoriesTable,
    eventsTable,
    expensesTable,
    taskAssignmentsTable,
    taskDependenciesTable,
    tasksTable
} from "../../db/schema.ts";

const DAY = 24 * 60 * 60 * 1000;

describe("Event duplication", () => {
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

    async function seedSourceEvent(clubId: number, userId: number, archived = false) {
        const start = new Date("2025-03-01T10:00:00Z");
        const [event] = await harness.db
            .insert(eventsTable)
            .values({ name: "O-Week", location: "Hall", start, end: new Date(start.getTime() + 3600_000), clubId, archived, attendanceOpen: true })
            .returning();

        const [first, second] = await harness.db
            .insert(tasksTable)
            .values([
                { eventId: event!.id, title: "Book venue", description: "Call them", priority: "high", progress: "completed", dueDate: new Date(start.getTime() - 10 * DAY), createdBy: userId },
                { eventId: event!.id, title: "Print flyers", description: "A5", priority: "low", progress: "in_progress", dueDate: null, createdBy: userId },
            ])
            .returning();
        await harness.db.insert(taskDependenciesTable).values({ taskId: second!.id, dependsOnTaskId: first!.id });
        await harness.db.insert(taskAssignmentsTable).values({ taskId: first!.id, userId });

        const [category] = await harness.db
            .insert(budgetCategoriesTable)
            .values({ eventId: event!.id, name: "Food", allocatedAmount: 250 })
            .returning();
        await harness.db.insert(expensesTable).values({ eventId: event!.id, categoryId: category!.id, amount: 40, description: "Pizza", createdBy: userId });

        return event!;
    }

    function duplicate(app: Awaited<ReturnType<TestDatabaseHarness["setupApp"]>>, cookie: string, id: number, body: object) {
        return app.request(`/api/events/${id}/duplicate`, {
            method: "POST",
            headers: { cookie },
            body: JSON.stringify({
                name: "O-Week 2026",
                location: "New Hall",
                start: "2026-03-01T10:00:00.000Z",
                end: "2026-03-01T11:00:00.000Z",
                ...body
            })
        });
    }

    it("prevents standard users from duplicating events", async () => {
        const app = await harness.setupApp();
        const club = await harness.setupClub("Club");
        const { cookie, user } = await harness.setupUser("test@test.com", "standard", club.id, "User");
        const source = await seedSourceEvent(club.id, user.id);

        const res = await duplicate(app, cookie, source.id, {});
        expect(res.status).toBe(403);
    });

    it.each(["admin", "exec"])("allows %s to duplicate just the event details", async (role) => {
        const app = await harness.setupApp();
        const club = await harness.setupClub("Club");
        const { cookie, user } = await harness.setupUser("test@test.com", role as "admin" | "exec", club.id, "User");
        const source = await seedSourceEvent(club.id, user.id);

        const res = await duplicate(app, cookie, source.id, { expectedAttendees: 80 });
        expect(res.status).toBe(201);

        const copy = await harness.db.query.eventsTable.findFirst({ where: { name: "O-Week 2026" } });
        expect(copy).not.toBeUndefined();
        expect(copy!.id).not.toBe(source.id);
        expect(copy!.slug).not.toBe(source.slug);
        expect(copy!.location).toBe("New Hall");
        expect(copy!.expectedAttendees).toBe(80);
        expect(copy!.attendanceOpen).toBe(false);
        expect(copy!.archived).toBe(false);

        expect(await harness.db.query.tasksTable.findMany({ where: { eventId: copy!.id } })).toHaveLength(0);
        expect(await harness.db.query.budgetCategoriesTable.findMany({ where: { eventId: copy!.id } })).toHaveLength(0);
    });

    it("copies tasks reset to backlog, shifting due dates and remapping dependencies", async () => {
        const app = await harness.setupApp();
        const club = await harness.setupClub("Club");
        const { cookie, user } = await harness.setupUser("test@test.com", "admin", club.id, "User");
        const source = await seedSourceEvent(club.id, user.id);

        const res = await duplicate(app, cookie, source.id, { includeTasks: true });
        expect(res.status).toBe(201);

        const copy = await harness.db.query.eventsTable.findFirst({ where: { name: "O-Week 2026" } });
        const tasks = await harness.db.query.tasksTable.findMany({ where: { eventId: copy!.id }, orderBy: { id: "asc" } });
        expect(tasks.map((t) => t.title)).toEqual(["Book venue", "Print flyers"]);
        expect(tasks.every((t) => t.progress === "backlog")).toBe(true);
        expect(tasks[0]!.priority).toBe("high");
        expect(tasks[0]!.dueDate).toEqual(new Date(copy!.start.getTime() - 10 * DAY));
        expect(tasks[1]!.dueDate).toBeNull();

        const assignments = await harness.db.query.taskAssignmentsTable.findMany({ where: { taskId: tasks[0]!.id } });
        expect(assignments).toHaveLength(0);

        const deps = await harness.db.query.taskDependenciesTable.findMany({ where: { taskId: tasks[1]!.id } });
        expect(deps.map((d) => d.dependsOnTaskId)).toEqual([tasks[0]!.id]);

        const audit = await harness.db.query.taskAuditLogTable.findMany({ where: { taskId: tasks[0]!.id } });
        expect(audit.map((a) => a.action)).toEqual(["created"]);

        // source untouched
        const sourceTasks = await harness.db.query.tasksTable.findMany({ where: { eventId: source.id } });
        expect(sourceTasks.map((t) => t.progress).sort()).toEqual(["completed", "in_progress"]);
    });

    it("copies budget categories without expenses", async () => {
        const app = await harness.setupApp();
        const club = await harness.setupClub("Club");
        const { cookie, user } = await harness.setupUser("test@test.com", "exec", club.id, "User");
        const source = await seedSourceEvent(club.id, user.id);

        const res = await duplicate(app, cookie, source.id, { includeBudget: true });
        expect(res.status).toBe(201);

        const copy = await harness.db.query.eventsTable.findFirst({ where: { name: "O-Week 2026" } });
        const categories = await harness.db.query.budgetCategoriesTable.findMany({ where: { eventId: copy!.id } });
        expect(categories.map((c) => [c.name, c.allocatedAmount])).toEqual([["Food", 250]]);
        expect(await harness.db.query.expensesTable.findMany({ where: { eventId: copy!.id } })).toHaveLength(0);
    });

    it("allows an archived event to be used as a template", async () => {
        const app = await harness.setupApp();
        const club = await harness.setupClub("Club");
        const { cookie, user } = await harness.setupUser("test@test.com", "admin", club.id, "User");
        const source = await seedSourceEvent(club.id, user.id, true);

        const res = await duplicate(app, cookie, source.id, { includeTasks: true, includeBudget: true });
        expect(res.status).toBe(201);

        const copy = await harness.db.query.eventsTable.findFirst({ where: { name: "O-Week 2026" } });
        expect(copy!.archived).toBe(false);
    });

    it("returns 404 when the source event belongs to another club", async () => {
        const app = await harness.setupApp();
        const club = await harness.setupClub("Club");
        const otherClub = await harness.setupClub("Other");
        const { cookie } = await harness.setupUser("test@test.com", "admin", club.id, "User");
        const { user: other } = await harness.setupUser("other@test.com", "admin", otherClub.id, "Other");
        const source = await seedSourceEvent(otherClub.id, other.id);

        const res = await duplicate(app, cookie, source.id, {});
        expect(res.status).toBe(404);
    });

    it("rejects an event that ends before it starts", async () => {
        const app = await harness.setupApp();
        const club = await harness.setupClub("Club");
        const { cookie, user } = await harness.setupUser("test@test.com", "admin", club.id, "User");
        const source = await seedSourceEvent(club.id, user.id);

        const res = await duplicate(app, cookie, source.id, { end: "2026-02-01T00:00:00.000Z" });
        expect(res.status).toBe(400);
        expect(await harness.db.query.eventsTable.findMany({ where: { clubId: club.id } })).toHaveLength(1);
    });
});
