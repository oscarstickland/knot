import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect } from "bun:test";
import { type TestDatabaseHarness, setupHarness } from "../harness.ts";
import {
    budgetCategoriesTable,
    eventAttendanceTable,
    eventDocumentsTable,
    eventsTable,
    expensesTable,
    incomeTable,
    taskAssignmentsTable,
    taskAuditLogTable,
    taskCommentsTable,
    taskDependenciesTable,
    tasksTable
} from "../../db/schema.ts";
import type { EventOverview } from "../../types/event-overview.ts";

const DAY_MS = 86_400_000;
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS);

describe("Event Overview Integration Test", () => {
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

    async function setupEvent(clubId: number, overrides: Partial<typeof eventsTable.$inferInsert> = {}) {
        const [event] = await harness.db
            .insert(eventsTable)
            .values({ name: "Event", location: "Main Hall", start: daysFromNow(3), end: daysFromNow(3.25), clubId, ...overrides })
            .returning();
        if (!event) throw new Error("Event returned is null");
        return event;
    }

    async function setupTask(
        eventId: number,
        createdBy: number,
        overrides: Partial<typeof tasksTable.$inferInsert> = {}
    ) {
        const [task] = await harness.db
            .insert(tasksTable)
            .values({ eventId, title: "Task", description: "Description", createdBy, ...overrides })
            .returning();
        if (!task) throw new Error("Task returned is null");
        return task;
    }

    async function setupCategory(eventId: number, name: string, allocatedAmount: number) {
        const [category] = await harness.db
            .insert(budgetCategoriesTable)
            .values({ eventId, name, allocatedAmount })
            .returning();
        if (!category) throw new Error("Category returned is null");
        return category;
    }

    async function getOverview(app: App, eventId: number, cookie: string) {
        return app.request(`/api/events/${eventId}/overview`, { headers: { cookie } });
    }

    describe("GET /api/events/:id/overview", () => {
        it("requires authentication", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);

            const res = await app.request(`/api/events/${event.id}/overview`);

            expect(res.status).toBe(401);
        });

        it("returns 404 for an event that does not exist", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");

            const res = await getOverview(app, 9999, cookie);

            expect(res.status).toBe(404);
        });

        it("returns 404 for an event in another club", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const otherClub = await harness.setupClub("Other Club");
            const event = await setupEvent(otherClub.id);
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");

            const res = await getOverview(app, event.id, cookie);

            expect(res.status).toBe(404);
        });

        it("hides archived events from standard members but not from admins", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id, { archived: true });
            const { cookie: standardCookie } = await harness.setupUser("standard@test.com", "standard", club.id, "Standard");
            const { cookie: adminCookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");

            expect((await getOverview(app, event.id, standardCookie)).status).toBe(404);
            expect((await getOverview(app, event.id, adminCookie)).status).toBe(200);
        });

        it("returns an empty overview for a brand new event", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");

            const res = await getOverview(app, event.id, cookie);
            const body = await res.json() as EventOverview;

            expect(res.status).toBe(200);
            expect(body.phase).toBe("upcoming");
            expect(body.tasks).toMatchObject({ total: 0, completed: 0, overdue: 0, blocked: 0, atRisk: [] });
            expect(body.attendance).toEqual({ checkedIn: 0, expected: null, firstCheckIn: null, lastCheckIn: null });
            expect(body.documents).toEqual({ total: 0, recent: [] });
            expect(body.activity).toEqual([]);
            expect(body.budget).toMatchObject({ totalIncome: 0, totalSpent: 0, net: 0, totalOwed: 0 });
        });

        it.each<[EventOverview["phase"], Date, Date]>([
            ["upcoming", daysFromNow(2), daysFromNow(3)],
            ["live", daysFromNow(-0.1), daysFromNow(0.1)],
            ["past", daysFromNow(-3), daysFromNow(-2)]
        ])("reports the %s phase", async (phase, start, end) => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id, { start, end });
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");

            const body = await (await getOverview(app, event.id, cookie)).json() as EventOverview;

            expect(body.phase).toBe(phase);
        });

        describe("tasks", () => {
            it("summarises progress, overdue and blocked tasks and lists the at risk ones", async () => {
                const app = await harness.setupApp();
                const club = await harness.setupClub("Club");
                const event = await setupEvent(club.id);
                const { user: admin, cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
                const { user: flynn } = await harness.setupUser("flynn@test.com", "standard", club.id, "Flynn Tiong");

                await setupTask(event.id, admin.id, { title: "Done", progress: "completed" });
                const overdue = await setupTask(event.id, admin.id, { title: "Confirm numbers", dueDate: daysFromNow(-6) });
                await harness.db.insert(taskAssignmentsTable).values({ taskId: overdue.id, userId: flynn.id });
                const design = await setupTask(event.id, admin.id, { title: "Design poster", dueDate: daysFromNow(-1), progress: "in_progress" });
                const print = await setupTask(event.id, admin.id, { title: "Print posters", dueDate: daysFromNow(2) });
                await harness.db.insert(taskDependenciesTable).values({ taskId: print.id, dependsOnTaskId: design.id });

                const body = await (await getOverview(app, event.id, cookie)).json() as EventOverview;

                expect(body.tasks).toMatchObject({ total: 4, completed: 1, overdue: 2, blocked: 1, atRiskCount: 3 });
                expect(body.tasks.atRisk.map((task) => [task.title, task.status])).toEqual([
                    ["Confirm numbers", "overdue"],
                    ["Design poster", "overdue"],
                    ["Print posters", "blocked"]
                ]);
                expect(body.tasks.atRisk[0]!.assignees).toEqual([{ id: flynn.id, name: "Flynn Tiong" }]);
                expect(body.tasks.atRisk[2]!.waitingOn).toEqual(["Design poster"]);
            });

            it("splits completed tasks into on time and late using the audit log", async () => {
                const app = await harness.setupApp();
                const club = await harness.setupClub("Club");
                const event = await setupEvent(club.id, { start: daysFromNow(-3), end: daysFromNow(-2.9) });
                const { user: admin, cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");

                const onTime = await setupTask(event.id, admin.id, { title: "On time", progress: "completed", dueDate: daysFromNow(-5) });
                const late = await setupTask(event.id, admin.id, { title: "Order marquee", progress: "completed", dueDate: daysFromNow(-5) });
                await harness.db.insert(taskAuditLogTable).values([
                    { taskId: onTime.id, changedBy: admin.id, action: "updated", changes: { progress: "completed" }, createdAt: daysFromNow(-6) },
                    { taskId: late.id, changedBy: admin.id, action: "updated", changes: { progress: "completed" }, createdAt: daysFromNow(-4) }
                ]);

                const body = await (await getOverview(app, event.id, cookie)).json() as EventOverview;

                expect(body.tasks.completion).toEqual({ onTime: 1, late: 1, noDueDate: 0, lateTitles: ["Order marquee"] });
            });

            it("uses the most recent completion when a task was reopened and completed again", async () => {
                const app = await harness.setupApp();
                const club = await harness.setupClub("Club");
                const event = await setupEvent(club.id);
                const { user: admin, cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
                const task = await setupTask(event.id, admin.id, { progress: "completed", dueDate: daysFromNow(-5) });
                await harness.db.insert(taskAuditLogTable).values([
                    { taskId: task.id, changedBy: admin.id, action: "updated", changes: { progress: "completed" }, createdAt: daysFromNow(-8) },
                    { taskId: task.id, changedBy: admin.id, action: "updated", changes: { progress: "in_progress" }, createdAt: daysFromNow(-7) },
                    { taskId: task.id, changedBy: admin.id, action: "updated", changes: { progress: "completed" }, createdAt: daysFromNow(-1) }
                ]);

                const body = await (await getOverview(app, event.id, cookie)).json() as EventOverview;

                expect(body.tasks.completion).toMatchObject({ onTime: 0, late: 1 });
            });

            it("only counts tasks belonging to the requested event", async () => {
                const app = await harness.setupApp();
                const club = await harness.setupClub("Club");
                const event = await setupEvent(club.id);
                const otherEvent = await setupEvent(club.id);
                const { user: admin, cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
                await setupTask(event.id, admin.id);
                await setupTask(otherEvent.id, admin.id, { dueDate: daysFromNow(-3) });

                const body = await (await getOverview(app, event.id, cookie)).json() as EventOverview;

                expect(body.tasks).toMatchObject({ total: 1, overdue: 0 });
            });
        });

        describe("attendance", () => {
            it("reports check-ins against the expected number", async () => {
                const app = await harness.setupApp();
                const club = await harness.setupClub("Club");
                const event = await setupEvent(club.id, { expectedAttendees: 160 });
                const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
                const first = daysFromNow(-0.2);
                const last = daysFromNow(-0.1);
                await harness.db.insert(eventAttendanceTable).values([
                    { eventId: event.id, name: "A", email: "a@test.com", createdAt: first },
                    { eventId: event.id, name: "B", email: "b@test.com", createdAt: last }
                ]);

                const body = await (await getOverview(app, event.id, cookie)).json() as EventOverview;

                expect(body.attendance.checkedIn).toBe(2);
                expect(body.attendance.expected).toBe(160);
                expect(new Date(body.attendance.firstCheckIn!).getTime()).toBe(first.getTime());
                expect(new Date(body.attendance.lastCheckIn!).getTime()).toBe(last.getTime());
            });
        });

        describe("documents", () => {
            it("returns the total and only the most recent few, newest first", async () => {
                const app = await harness.setupApp();
                const club = await harness.setupClub("Club");
                const event = await setupEvent(club.id);
                const { user: admin, cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin Person");
                await harness.db.insert(eventDocumentsTable).values(
                    Array.from({ length: 6 }, (_, index) => ({
                        eventId: event.id,
                        title: `Doc ${index}`,
                        url: `https://example.com/${index}`,
                        addedBy: admin.id,
                        createdAt: daysFromNow(-10 + index)
                    }))
                );

                const body = await (await getOverview(app, event.id, cookie)).json() as EventOverview;

                expect(body.documents.total).toBe(6);
                expect(body.documents.recent.map((document) => document.title)).toEqual(["Doc 5", "Doc 4", "Doc 3", "Doc 2"]);
                expect(body.documents.recent[0]!.addedBy).toBe("Admin Person");
            });
        });

        describe("activity", () => {
            it("merges task, comment, document and money activity newest first with people's names", async () => {
                const app = await harness.setupApp();
                const club = await harness.setupClub("Club");
                const event = await setupEvent(club.id);
                const { user: admin, cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
                const { user: caleb } = await harness.setupUser("caleb@test.com", "standard", club.id, "Caleb Lau");
                const task = await setupTask(event.id, admin.id, { title: "Confirm venue capacity" });
                const category = await setupCategory(event.id, "Catering", 500);

                await harness.db.insert(taskAuditLogTable).values([
                    { taskId: task.id, changedBy: admin.id, action: "created", changes: {}, createdAt: daysFromNow(-5) },
                    { taskId: task.id, changedBy: caleb.id, action: "updated", changes: { progress: "completed" }, createdAt: daysFromNow(-0.2) }
                ]);
                await harness.db.insert(taskCommentsTable).values({ taskId: task.id, authorId: admin.id, body: "Hi", createdAt: daysFromNow(-1) });
                await harness.db.insert(expensesTable).values({
                    eventId: event.id, categoryId: category.id, amount: 480, description: "Pizza", createdBy: caleb.id, createdAt: daysFromNow(-2)
                });
                await harness.db.insert(incomeTable).values({
                    eventId: event.id, source: "Grant", amount: 200, createdBy: admin.id, createdAt: daysFromNow(-3)
                });
                await harness.db.insert(eventDocumentsTable).values({
                    eventId: event.id, title: "Run sheet", url: "https://example.com", addedBy: admin.id, createdAt: daysFromNow(-4)
                });

                const body = await (await getOverview(app, event.id, cookie)).json() as EventOverview;

                expect(body.activity.map((entry) => entry.kind)).toEqual([
                    "task_progress", "comment", "expense", "income", "document", "task_created"
                ]);
                expect(body.activity[0]).toMatchObject({ actorName: "Caleb Lau", subject: "Confirm venue capacity", progress: "completed" });
                expect(body.activity[2]).toMatchObject({ actorName: "Caleb Lau", subject: "Catering", amount: 480 });
            });

            it("caps the feed at eight entries", async () => {
                const app = await harness.setupApp();
                const club = await harness.setupClub("Club");
                const event = await setupEvent(club.id);
                const { user: admin, cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
                const task = await setupTask(event.id, admin.id);
                await harness.db.insert(taskCommentsTable).values(
                    Array.from({ length: 12 }, (_, index) => ({
                        taskId: task.id, authorId: admin.id, body: `c${index}`, createdAt: daysFromNow(-index)
                    }))
                );

                const body = await (await getOverview(app, event.id, cookie)).json() as EventOverview;

                expect(body.activity).toHaveLength(8);
            });
        });

        describe("budget", () => {
            it("summarises money for execs and admins", async () => {
                const app = await harness.setupApp();
                const club = await harness.setupClub("Club");
                const event = await setupEvent(club.id);
                const { user: exec, cookie } = await harness.setupUser("exec@test.com", "exec", club.id, "Exec");
                const { user: member } = await harness.setupUser("member@test.com", "standard", club.id, "Member");
                const catering = await setupCategory(event.id, "Catering", 700);
                const hire = await setupCategory(event.id, "Hire", 300);
                await harness.db.insert(incomeTable).values([
                    { eventId: event.id, source: "Takings", amount: 640, createdBy: exec.id },
                    { eventId: event.id, source: "Grant", amount: 460, createdBy: exec.id }
                ]);
                await harness.db.insert(expensesTable).values([
                    { eventId: event.id, categoryId: catering.id, amount: 610, description: "Food", createdBy: member.id, paidPersonally: true },
                    { eventId: event.id, categoryId: hire.id, amount: 280, description: "Marquee", createdBy: exec.id, paidPersonally: true, reimbursedAt: new Date() }
                ]);

                const body = await (await getOverview(app, event.id, cookie)).json() as EventOverview;

                expect(body.budget).toEqual({
                    totalIncome: 1100,
                    totalSpent: 890,
                    totalAllocated: 1000,
                    net: 210,
                    totalOwed: 610,
                    owedClaims: 1,
                    incomeLines: [{ label: "Takings", amount: 640 }, { label: "Grant", amount: 460 }],
                    expenseLines: [{ label: "Catering", amount: 610 }, { label: "Hire", amount: 280 }]
                });
            });

            it("withholds budget figures and money activity from standard members", async () => {
                const app = await harness.setupApp();
                const club = await harness.setupClub("Club");
                const event = await setupEvent(club.id);
                const { user: admin } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
                const { user: member, cookie } = await harness.setupUser("member@test.com", "standard", club.id, "Member");
                const category = await setupCategory(event.id, "Catering", 500);
                await harness.db.insert(incomeTable).values({ eventId: event.id, source: "Grant", amount: 900, createdBy: admin.id });
                await harness.db.insert(expensesTable).values({
                    eventId: event.id, categoryId: category.id, amount: 50, description: "Snacks", createdBy: member.id
                });

                const res = await getOverview(app, event.id, cookie);
                const body = await res.json() as EventOverview;

                expect(res.status).toBe(200);
                expect(body.budget).toBeNull();
                expect(body.activity.filter((entry) => entry.kind === "expense" || entry.kind === "income")).toEqual([]);
                expect(JSON.stringify(body)).not.toContain("Grant");
            });
        });
    });
});
