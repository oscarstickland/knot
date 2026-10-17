import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect } from "bun:test";
import { type TestDatabaseHarness, setupHarness } from "../harness.ts";
import { budgetCategoriesTable, eventsTable, incomeTable } from "../../db/schema.ts";
import type { EventBudgetSummary, EventSpending, MemberBudgetView } from "../../types/budget.ts";

type HTTPError = {
    message: string
}

describe("Income Integration Test", () => {
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
        const now = new Date();
        const [event] = await harness.db
            .insert(eventsTable)
            .values({
                name: "Event",
                location: "Main Hall",
                start: now,
                end: new Date(now.valueOf() + 5000),
                clubId
            })
            .returning();
        if (!event) throw new Error("Event returned is null");
        return event;
    }

    async function setupIncome(eventId: number, createdBy: number, amount: number, source: string = "Sponsor") {
        const [income] = await harness.db
            .insert(incomeTable)
            .values({ eventId, createdBy, amount, source })
            .returning();
        if (!income) throw new Error("Income returned is null");
        return income;
    }

    type App = Awaited<ReturnType<TestDatabaseHarness["setupApp"]>>;

    function postIncome(app: App, eventId: number, cookie: string, payload: unknown) {
        return app.request(`/api/events/${eventId}/income`, {
            method: "POST",
            headers: { cookie },
            body: JSON.stringify(payload)
        });
    }

    describe("POST /api/events/:id/income", () => {
        it.each(["exec", "admin"])("allows %s to record income with a source", async (role) => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user, cookie } = await harness.setupUser("actor@test.com", role, club.id, "Actor");

            const res = await postIncome(app, event.id, cookie, { source: "Student union", amount: 250.5, description: "Grant" });
            expect(res.status).toBe(201);

            const stored = await harness.db.query.incomeTable.findFirst({ where: { eventId: event.id } });
            expect(stored).toMatchObject({ source: "Student union", amount: 250.5, description: "Grant", createdBy: user.id });
        });

        it("prevents standard users from recording income", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { cookie } = await harness.setupUser("standard@test.com", "standard", club.id, "Standard");

            const res = await postIncome(app, event.id, cookie, { source: "Sponsor", amount: 10 });
            expect(res.status).toBe(403);
            expect(await harness.db.query.incomeTable.findMany()).toEqual([]);
        });

        it("trims the source and stores a missing description as null", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { cookie } = await harness.setupUser("exec@test.com", "exec", club.id, "Exec");

            const res = await postIncome(app, event.id, cookie, { source: "  Ticket sales  ", amount: 40 });
            expect(res.status).toBe(201);

            const stored = await harness.db.query.incomeTable.findFirst({ where: { eventId: event.id } });
            expect(stored?.source).toBe("Ticket sales");
            expect(stored?.description).toBeNull();
        });

        it.each([
            ["a blank source", { source: "   ", amount: 10 }],
            ["a missing source", { amount: 10 }],
            ["a zero amount", { source: "Sponsor", amount: 0 }],
            ["a negative amount", { source: "Sponsor", amount: -5 }],
            ["a non-numeric amount", { source: "Sponsor", amount: "ten" }],
            ["an oversized description", { source: "Sponsor", amount: 5, description: "a".repeat(501) }]
        ])("rejects %s", async (_label, payload) => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { cookie } = await harness.setupUser("exec@test.com", "exec", club.id, "Exec");

            const res = await postIncome(app, event.id, cookie, payload);
            expect(res.status).toBe(400);
            expect(await harness.db.query.incomeTable.findMany()).toEqual([]);
        });

        it("returns 404 for an event in another club", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const otherClub = await harness.setupClub("Other Club");
            const foreignEvent = await setupEvent(otherClub.id);
            const { cookie } = await harness.setupUser("exec@test.com", "exec", club.id, "Exec");

            const res = await postIncome(app, foreignEvent.id, cookie, { source: "Sponsor", amount: 10 });
            expect(res.status).toBe(404);
            expect(await harness.db.query.incomeTable.findMany()).toEqual([]);
        });

        it("requires authentication", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);

            const res = await app.request(`/api/events/${event.id}/income`, {
                method: "POST",
                body: JSON.stringify({ source: "Sponsor", amount: 10 })
            });
            expect(res.status).toBe(401);
        });
    });

    describe("income in the event budget", () => {
        it("lists income and totals it for execs", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user, cookie } = await harness.setupUser("exec@test.com", "exec", club.id, "Exec");
            await setupIncome(event.id, user.id, 100, "Sponsor");
            await setupIncome(event.id, user.id, 25.5, "Ticket sales");

            const res = await app.request(`/api/events/${event.id}/budget`, { headers: { cookie } });
            const body = await res.json() as EventBudgetSummary;

            expect(body.totalIncome).toBe(125.5);
            expect(body.income.map((entry) => [entry.source, entry.amount])).toEqual([
                ["Sponsor", 100],
                ["Ticket sales", 25.5]
            ]);
            expect(body.income[0]!.creator).toEqual({ id: user.id, name: "Exec" });
        });

        it("does not include income from other events", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const otherEvent = await setupEvent(club.id);
            const { user, cookie } = await harness.setupUser("exec@test.com", "exec", club.id, "Exec");
            await setupIncome(otherEvent.id, user.id, 999);

            const res = await app.request(`/api/events/${event.id}/budget`, { headers: { cookie } });
            const body = await res.json() as EventBudgetSummary;

            expect(body.income).toEqual([]);
            expect(body.totalIncome).toBe(0);
        });

        it("never exposes income to standard members", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: exec } = await harness.setupUser("exec@test.com", "exec", club.id, "Exec");
            const { cookie } = await harness.setupUser("standard@test.com", "standard", club.id, "Standard");
            await setupIncome(event.id, exec.id, 100);

            const res = await app.request(`/api/events/${event.id}/budget`, { headers: { cookie } });
            const body = await res.json() as MemberBudgetView;

            expect(body.scope).toBe("own");
            expect(body).not.toHaveProperty("income");
            expect(body).not.toHaveProperty("totalIncome");
        });
    });

    describe("PUT/DELETE /api/budget/income/:id", () => {
        async function setup(role: "standard" | "exec" | "admin" = "exec") {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user, cookie } = await harness.setupUser("actor@test.com", role, club.id, "Actor");
            const income = await setupIncome(event.id, user.id, 100, "Sponsor");
            return { app, club, event, user, cookie, income };
        }

        it.each(["exec", "admin"] as const)("allows %s to update income", async (role) => {
            const { app, cookie, income } = await setup(role);

            const res = await app.request(`/api/budget/income/${income.id}`, {
                method: "PUT",
                headers: { cookie },
                body: JSON.stringify({ source: "Grant", amount: 75, description: "Updated" })
            });
            expect(res.status).toBe(200);

            const stored = await harness.db.query.incomeTable.findFirst({ where: { id: income.id } });
            expect(stored).toMatchObject({ source: "Grant", amount: 75, description: "Updated" });
        });

        it("rejects an invalid update payload", async () => {
            const { app, cookie, income } = await setup();

            const res = await app.request(`/api/budget/income/${income.id}`, {
                method: "PUT",
                headers: { cookie },
                body: JSON.stringify({ source: "", amount: -1 })
            });
            expect(res.status).toBe(400);

            const stored = await harness.db.query.incomeTable.findFirst({ where: { id: income.id } });
            expect(stored).toMatchObject({ source: "Sponsor", amount: 100 });
        });

        it("prevents standard users from updating or deleting income", async () => {
            const { app, club, income } = await setup();
            const { cookie: standardCookie } = await harness.setupUser("standard@test.com", "standard", club.id, "Standard");

            const putRes = await app.request(`/api/budget/income/${income.id}`, {
                method: "PUT",
                headers: { cookie: standardCookie },
                body: JSON.stringify({ source: "Hacked", amount: 1 })
            });
            const deleteRes = await app.request(`/api/budget/income/${income.id}`, {
                method: "DELETE",
                headers: { cookie: standardCookie }
            });

            expect(putRes.status).toBe(403);
            expect(deleteRes.status).toBe(403);
            const stored = await harness.db.query.incomeTable.findFirst({ where: { id: income.id } });
            expect(stored).toMatchObject({ source: "Sponsor", amount: 100 });
        });

        it("lets any exec in the club delete income recorded by someone else", async () => {
            const { app, club, income } = await setup();
            const { cookie: otherExecCookie } = await harness.setupUser("other@test.com", "exec", club.id, "Other");

            const res = await app.request(`/api/budget/income/${income.id}`, {
                method: "DELETE",
                headers: { cookie: otherExecCookie }
            });
            expect(res.status).toBe(200);
            expect(await harness.db.query.incomeTable.findMany()).toEqual([]);
        });

        it("returns 404 for income in another club", async () => {
            const { app, income } = await setup();
            const otherClub = await harness.setupClub("Other Club");
            const { cookie: foreignCookie } = await harness.setupUser("foreign@test.com", "admin", otherClub.id, "Foreign");

            const putRes = await app.request(`/api/budget/income/${income.id}`, {
                method: "PUT",
                headers: { cookie: foreignCookie },
                body: JSON.stringify({ source: "Hacked", amount: 1 })
            });
            const deleteRes = await app.request(`/api/budget/income/${income.id}`, {
                method: "DELETE",
                headers: { cookie: foreignCookie }
            });

            expect(putRes.status).toBe(404);
            expect(((await putRes.json()) as HTTPError).message).toBe("Income not found");
            expect(deleteRes.status).toBe(404);
            expect(await harness.db.query.incomeTable.findMany()).toHaveLength(1);
        });

        it("returns 404 for unknown income", async () => {
            const { app, cookie } = await setup();

            const res = await app.request("/api/budget/income/999999", { method: "DELETE", headers: { cookie } });
            expect(res.status).toBe(404);
        });
    });

    describe("GET /api/budget/spending", () => {
        it("includes income totals per event", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user, cookie } = await harness.setupUser("exec@test.com", "exec", club.id, "Exec");
            await setupIncome(event.id, user.id, 100);
            await setupIncome(event.id, user.id, 50);

            const res = await app.request("/api/budget/spending", { headers: { cookie } });
            const body = await res.json() as EventSpending[];

            expect(body).toHaveLength(1);
            expect(body[0]).toMatchObject({ eventId: event.id, totalAllocated: 0, totalSpent: 0, totalIncome: 150 });
        });

        it("defaults income to zero for events without any", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { cookie } = await harness.setupUser("exec@test.com", "exec", club.id, "Exec");
            await harness.db.insert(budgetCategoriesTable)
                .values({ eventId: event.id, name: "Venue", allocatedAmount: 10 });

            const res = await app.request("/api/budget/spending", { headers: { cookie } });
            const body = await res.json() as EventSpending[];

            expect(body[0]?.totalIncome).toBe(0);
        });

        it("excludes income from other clubs", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const otherClub = await harness.setupClub("Other Club");
            const foreignEvent = await setupEvent(otherClub.id);
            const { user: foreignUser } = await harness.setupUser("foreign@test.com", "exec", otherClub.id, "Foreign");
            const { cookie } = await harness.setupUser("exec@test.com", "exec", club.id, "Exec");
            await setupIncome(foreignEvent.id, foreignUser.id, 500);

            const res = await app.request("/api/budget/spending", { headers: { cookie } });
            expect(await res.json()).toEqual([]);
        });
    });
});
