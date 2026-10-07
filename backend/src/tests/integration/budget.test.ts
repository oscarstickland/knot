import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect } from "bun:test";
import { type TestDatabaseHarness, setupHarness } from "../harness.ts";
import { budgetCategoriesTable, eventsTable, expensesTable } from "../../db/schema.ts";
import type { EventBudgetSummary, EventSpending, Expense, MemberBudgetView } from "../../types/budget.ts";

type HTTPError = {
    message: string
}

describe("Budget Integration Test", () => {
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

    async function setupEvent(clubId: number, overrides: { name?: string, start?: Date, archived?: boolean } = {}) {
        const referenceDate = overrides.start ?? new Date();
        const [event] = await harness.db
            .insert(eventsTable)
            .values({
                name: overrides.name ?? "Event",
                location: "Main Hall",
                start: referenceDate,
                end: new Date(referenceDate.valueOf() + 5000),
                archived: overrides.archived ?? false,
                clubId
            })
            .returning();
        if (!event) throw new Error("Event returned is null");
        return event;
    }

    async function setupCategory(eventId: number, name: string = "Venue", allocatedAmount: number = 0) {
        const [category] = await harness.db
            .insert(budgetCategoriesTable)
            .values({ eventId, name, allocatedAmount })
            .returning();
        if (!category) throw new Error("Category returned is null");
        return category;
    }

    async function setupExpense(eventId: number, categoryId: number, createdBy: number, amount: number, description: string = "Expense") {
        const [expense] = await harness.db
            .insert(expensesTable)
            .values({ eventId, categoryId, createdBy, amount, description })
            .returning();
        if (!expense) throw new Error("Expense returned is null");
        return expense;
    }

    async function putBudget(app: Awaited<ReturnType<TestDatabaseHarness["setupApp"]>>, eventId: number, cookie: string, categories: unknown[]) {
        return app.request(`/api/events/${eventId}/budget`, {
            method: "PUT",
            headers: { cookie },
            body: JSON.stringify({ categories })
        });
    }

    describe("PUT /api/events/:id/budget (configure categories)", () => {
        it("prevents standard users from configuring a budget", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { cookie } = await harness.setupUser("standard@test.com", "standard", club.id, "Standard");

            const res = await putBudget(app, event.id, cookie, [{ name: "Venue", allocatedAmount: 100 }]);
            expect(res.status).toBe(403);
        });

        it.each(["exec", "admin"])("allows %s to create categories on an event", async (role) => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { cookie } = await harness.setupUser("actor@test.com", role, club.id, "Actor");

            const res = await putBudget(app, event.id, cookie, [
                { name: "Venue", allocatedAmount: 250 },
                { name: "Catering", allocatedAmount: 100 }
            ]);
            expect(res.status).toBe(200);
            const body = await res.json() as EventBudgetSummary;
            expect(body.totalAllocated).toBe(350);

            const categories = await harness.db.query.budgetCategoriesTable.findMany({ where: { eventId: event.id } });
            expect(categories.map((category) => category.name).sort()).toEqual(["Catering", "Venue"]);
        });

        it("keeps categories scoped to their own event", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const eventOne = await setupEvent(club.id);
            const eventTwo = await setupEvent(club.id);
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            await setupCategory(eventTwo.id, "Venue", 999);

            const res = await putBudget(app, eventOne.id, cookie, [{ name: "Venue", allocatedAmount: 10 }]);
            expect(res.status).toBe(200);

            const otherEventCategories = await harness.db.query.budgetCategoriesTable.findMany({ where: { eventId: eventTwo.id } });
            expect(otherEventCategories.length).toBe(1);
            expect(otherEventCategories[0]!.allocatedAmount).toBe(999);
        });

        it("updates, creates and removes categories in one request", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const venue = await setupCategory(event.id, "Venue", 100);
            await setupCategory(event.id, "Marketing", 50);

            const res = await putBudget(app, event.id, cookie, [
                { id: venue.id, name: "Hall Hire", allocatedAmount: 400 },
                { name: "Catering", allocatedAmount: 200 }
            ]);
            expect(res.status).toBe(200);

            const categories = await harness.db.query.budgetCategoriesTable.findMany({ where: { eventId: event.id } });
            expect(categories.length).toBe(2);
            const renamed = categories.find((category) => category.id === venue.id);
            expect(renamed?.name).toBe("Hall Hire");
            expect(renamed?.allocatedAmount).toBe(400);
            expect(categories.some((category) => category.name === "Catering")).toBe(true);
        });

        it("allows two categories to swap names", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const venue = await setupCategory(event.id, "Venue");
            const catering = await setupCategory(event.id, "Catering");

            const res = await putBudget(app, event.id, cookie, [
                { id: venue.id, name: "Catering", allocatedAmount: 0 },
                { id: catering.id, name: "Venue", allocatedAmount: 0 }
            ]);
            expect(res.status).toBe(200);

            const swappedVenue = await harness.db.query.budgetCategoriesTable.findFirst({ where: { id: venue.id } });
            const swappedCatering = await harness.db.query.budgetCategoriesTable.findFirst({ where: { id: catering.id } });
            expect(swappedVenue?.name).toBe("Catering");
            expect(swappedCatering?.name).toBe("Venue");
        });

        it("returns the full budget summary after saving", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: admin, cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const venue = await setupCategory(event.id, "Venue", 100);
            await setupExpense(event.id, venue.id, admin.id, 40);

            const res = await putBudget(app, event.id, cookie, [
                { id: venue.id, name: "Venue", allocatedAmount: 300 },
                { name: "Catering", allocatedAmount: 50 }
            ]);
            expect(res.status).toBe(200);
            const body = await res.json() as EventBudgetSummary;

            expect(body.scope).toBe("full");
            expect(body.totalAllocated).toBe(350);
            expect(body.totalSpent).toBe(40);
            expect(body.categories.map((category) => [category.name, category.allocatedAmount, category.spent])).toEqual([
                ["Venue", 300, 40],
                ["Catering", 50, 0]
            ]);
            expect(body.expenses.length).toBe(1);
        });

        it("trims whitespace from category names", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");

            const res = await putBudget(app, event.id, cookie, [{ name: "  Venue  ", allocatedAmount: 10 }]);
            expect(res.status).toBe(200);

            const category = await harness.db.query.budgetCategoriesTable.findFirst({ where: { eventId: event.id } });
            expect(category?.name).toBe("Venue");
        });

        it.each([
            ["a negative allocation", [{ name: "Venue", allocatedAmount: -1 }]],
            ["a blank name", [{ name: "   ", allocatedAmount: 1 }]],
            ["a missing allocation", [{ name: "Venue" }]],
            ["a non-integer id", [{ id: 1.5, name: "Venue", allocatedAmount: 1 }]]
        ])("rejects %s", async (_label, categories) => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");

            const res = await putBudget(app, event.id, cookie, categories);
            expect(res.status).toBe(400);

            const stored = await harness.db.query.budgetCategoriesTable.findMany({ where: { eventId: event.id } });
            expect(stored).toEqual([]);
        });

        it("rejects a payload without a categories array", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");

            const res = await app.request(`/api/events/${event.id}/budget`, {
                method: "PUT",
                headers: { cookie },
                body: JSON.stringify({ allocations: [] })
            });
            expect(res.status).toBe(400);
        });

        it("removes unused categories while keeping ones that have expenses", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: admin, cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const venue = await setupCategory(event.id, "Venue", 100);
            const marketing = await setupCategory(event.id, "Marketing", 50);
            await setupExpense(event.id, venue.id, admin.id, 20);

            const res = await putBudget(app, event.id, cookie, [{ id: venue.id, name: "Venue", allocatedAmount: 100 }]);
            expect(res.status).toBe(200);

            const removed = await harness.db.query.budgetCategoriesTable.findFirst({ where: { id: marketing.id } });
            expect(removed).toBeUndefined();
            const kept = await harness.db.query.expensesTable.findMany({ where: { eventId: event.id } });
            expect(kept.length).toBe(1);
        });

        it("rejects duplicate category names", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");

            const res = await putBudget(app, event.id, cookie, [
                { name: "Venue", allocatedAmount: 1 },
                { name: "venue", allocatedAmount: 2 }
            ]);
            expect(res.status).toBe(400);
        });

        it("rejects updating a category that belongs to a different event", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const otherEvent = await setupEvent(club.id);
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const foreignCategory = await setupCategory(otherEvent.id);

            const res = await putBudget(app, event.id, cookie, [{ id: foreignCategory.id, name: "Stolen", allocatedAmount: 1 }]);
            expect(res.status).toBe(400);

            const untouched = await harness.db.query.budgetCategoriesTable.findFirst({ where: { id: foreignCategory.id } });
            expect(untouched?.name).toBe("Venue");
        });

        it("prevents removing a category that has expenses logged against it", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: admin, cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const category = await setupCategory(event.id, "Venue");
            await setupExpense(event.id, category.id, admin.id, 50);

            const res = await putBudget(app, event.id, cookie, []);
            expect(res.status).toBe(409);
            const body = await res.json() as HTTPError;
            expect(body.message).toContain("Venue");

            const stillExists = await harness.db.query.budgetCategoriesTable.findFirst({ where: { id: category.id } });
            expect(stillExists).not.toBeUndefined();
        });

        it("does not allow configuring a budget for an event in another club", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const otherClub = await harness.setupClub("Other Club");
            const otherEvent = await setupEvent(otherClub.id);
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");

            const res = await putBudget(app, otherEvent.id, cookie, [{ name: "Venue", allocatedAmount: 1 }]);
            expect(res.status).toBe(404);
        });
    });

    describe("GET /api/events/:id/budget (summary)", () => {
        it("returns categories with spent totals and expenses", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: admin, cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const category = await setupCategory(event.id, "Venue", 500);
            await setupExpense(event.id, category.id, admin.id, 120, "Deposit");
            await setupExpense(event.id, category.id, admin.id, 80, "Cleaning fee");

            const res = await app.request(`/api/events/${event.id}/budget`, { headers: { cookie } });
            expect(res.status).toBe(200);
            const body = await res.json() as EventBudgetSummary;

            expect(body.totalAllocated).toBe(500);
            expect(body.totalSpent).toBe(200);
            expect(body.categories[0]!.spent).toBe(200);
            expect(body.expenses.length).toBe(2);
        });

        it.each(["exec", "admin"])("shows %s every member's expenses", async (role) => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { cookie } = await harness.setupUser("actor@test.com", role, club.id, "Actor");
            const { user: member } = await harness.setupUser("standard@test.com", "standard", club.id, "Standard");
            const category = await setupCategory(event.id, "Venue", 100);
            await setupExpense(event.id, category.id, member.id, 30, "Snacks");

            const res = await app.request(`/api/events/${event.id}/budget`, { headers: { cookie } });
            expect(res.status).toBe(200);
            const body = await res.json() as EventBudgetSummary;

            expect(body.scope).toBe("full");
            expect(body.expenses.map((expense) => expense.description)).toEqual(["Snacks"]);
            expect(body.expenses[0]!.creator).toEqual({ id: member.id, name: "Standard" });
        });

        it("reports zero spend for categories without expenses, in creation order", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: admin, cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            await setupCategory(event.id, "Venue", 100);
            const catering = await setupCategory(event.id, "Catering", 50);
            await setupCategory(event.id, "Marketing", 25);
            await setupExpense(event.id, catering.id, admin.id, 10);

            const res = await app.request(`/api/events/${event.id}/budget`, { headers: { cookie } });
            const body = await res.json() as EventBudgetSummary;

            expect(body.categories.map((category) => [category.name, category.spent])).toEqual([
                ["Venue", 0],
                ["Catering", 10],
                ["Marketing", 0]
            ]);
        });

        it("returns an empty budget for an event with no categories", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");

            const res = await app.request(`/api/events/${event.id}/budget`, { headers: { cookie } });
            expect(res.status).toBe(200);
            const body = await res.json() as EventBudgetSummary;

            expect(body).toEqual({ scope: "full", categories: [], expenses: [], totalAllocated: 0, totalSpent: 0 });
        });

        it("only exposes the id and name of an expense's creator", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: admin, cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const category = await setupCategory(event.id);
            await setupExpense(event.id, category.id, admin.id, 10);

            const res = await app.request(`/api/events/${event.id}/budget`, { headers: { cookie } });
            const body = await res.json() as EventBudgetSummary;

            expect(body.expenses[0]!.creator).toEqual({ id: admin.id, name: "Admin" });
            expect(body.expenses[0]!.category).toEqual({ id: category.id, name: "Venue" });
        });

        it("only shows standard users category names and their own expenses", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: admin } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const { user: member, cookie } = await harness.setupUser("standard@test.com", "standard", club.id, "Standard");
            const category = await setupCategory(event.id, "Venue", 500);
            await setupExpense(event.id, category.id, admin.id, 120, "Deposit");
            await setupExpense(event.id, category.id, member.id, 30, "Snacks");

            const res = await app.request(`/api/events/${event.id}/budget`, { headers: { cookie } });
            expect(res.status).toBe(200);
            const body = await res.json() as MemberBudgetView & Record<string, unknown>;

            expect(body.scope).toBe("own");
            expect(body.categories).toEqual([{ id: category.id, name: "Venue" }]);
            expect(body.expenses.length).toBe(1);
            expect(body.expenses[0]!.description).toBe("Snacks");
            expect(body.expenses[0]!.category).toEqual({ id: category.id, name: "Venue" });
            expect(body.totalAllocated).toBeUndefined();
            expect(body.totalSpent).toBeUndefined();
        });

        it("does not allow viewing a budget for an event in another club", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const otherClub = await harness.setupClub("Other Club");
            const otherEvent = await setupEvent(otherClub.id);
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");

            const res = await app.request(`/api/events/${otherEvent.id}/budget`, { headers: { cookie } });
            expect(res.status).toBe(404);
        });

        it("does not allow a standard user to view a budget for an event in another club", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const otherClub = await harness.setupClub("Other Club");
            const otherEvent = await setupEvent(otherClub.id);
            const { cookie } = await harness.setupUser("standard@test.com", "standard", club.id, "Standard");

            const res = await app.request(`/api/events/${otherEvent.id}/budget`, { headers: { cookie } });
            expect(res.status).toBe(404);
        });
    });

    describe("POST /api/events/:id/expenses (create)", () => {
        it("allows standard users to log an expense", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const category = await setupCategory(event.id);
            const { user: member, cookie } = await harness.setupUser("standard@test.com", "standard", club.id, "Standard");

            const res = await app.request(`/api/events/${event.id}/expenses`, {
                method: "POST",
                headers: { cookie },
                body: JSON.stringify({ categoryId: category.id, amount: 50, description: "Snacks" })
            });
            expect(res.status).toBe(201);

            const created = await harness.db.query.expensesTable.findFirst({ where: { eventId: event.id } });
            expect(created?.createdBy).toBe(member.id);
        });

        it.each(["exec", "admin"])("allows %s to log an expense", async (role) => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const category = await setupCategory(event.id);
            const { cookie } = await harness.setupUser("actor@test.com", role, club.id, "Actor");

            const res = await app.request(`/api/events/${event.id}/expenses`, {
                method: "POST",
                headers: { cookie },
                body: JSON.stringify({ categoryId: category.id, amount: 50, description: "Snacks" })
            });
            expect(res.status).toBe(201);

            const created = await harness.db.query.expensesTable.findFirst({ where: { eventId: event.id } });
            expect(created?.amount).toBe(50);
        });

        it("rejects a category belonging to a different event", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const otherEvent = await setupEvent(club.id);
            const foreignCategory = await setupCategory(otherEvent.id);
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");

            const res = await app.request(`/api/events/${event.id}/expenses`, {
                method: "POST",
                headers: { cookie },
                body: JSON.stringify({ categoryId: foreignCategory.id, amount: 50, description: "Snacks" })
            });
            expect(res.status).toBe(400);
        });

        it("does not allow logging an expense against an event in another club", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const otherClub = await harness.setupClub("Other Club");
            const otherEvent = await setupEvent(otherClub.id);
            const foreignCategory = await setupCategory(otherEvent.id);
            const { cookie } = await harness.setupUser("standard@test.com", "standard", club.id, "Standard");

            const res = await app.request(`/api/events/${otherEvent.id}/expenses`, {
                method: "POST",
                headers: { cookie },
                body: JSON.stringify({ categoryId: foreignCategory.id, amount: 50, description: "Snacks" })
            });
            expect(res.status).toBe(404);

            const created = await harness.db.query.expensesTable.findMany({ where: { eventId: otherEvent.id } });
            expect(created).toEqual([]);
        });

        it.each([
            ["a non-positive amount", { amount: 0, description: "Snacks" }],
            ["an empty description", { amount: 10, description: "" }]
        ])("rejects %s", async (_label, payload) => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const category = await setupCategory(event.id);
            const { cookie } = await harness.setupUser("standard@test.com", "standard", club.id, "Standard");

            const res = await app.request(`/api/events/${event.id}/expenses`, {
                method: "POST",
                headers: { cookie },
                body: JSON.stringify({ categoryId: category.id, ...payload })
            });
            expect(res.status).toBe(400);
        });
    });

    describe("PUT/DELETE /api/budget/expenses/:id", () => {
        it("allows an exec to update an expense", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: admin, cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const category = await setupCategory(event.id);
            const expense = await setupExpense(event.id, category.id, admin.id, 50, "Original");

            const res = await app.request(`/api/budget/expenses/${expense.id}`, {
                method: "PUT",
                headers: { cookie },
                body: JSON.stringify({ categoryId: category.id, amount: 75, description: "Updated" })
            });
            expect(res.status).toBe(200);
            const body = await res.json() as Expense;
            expect(body.amount).toBe(75);
            expect(body.description).toBe("Updated");
        });

        it("prevents updating an expense from another club", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const otherClub = await harness.setupClub("Other Club");
            const otherEvent = await setupEvent(otherClub.id);
            const { user: otherAdmin } = await harness.setupUser("other-admin@test.com", "admin", otherClub.id, "Other Admin");
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const foreignCategory = await setupCategory(otherEvent.id);
            const expense = await setupExpense(otherEvent.id, foreignCategory.id, otherAdmin.id, 50);

            const res = await app.request(`/api/budget/expenses/${expense.id}`, {
                method: "PUT",
                headers: { cookie },
                body: JSON.stringify({ categoryId: foreignCategory.id, amount: 75, description: "Updated" })
            });
            expect(res.status).toBe(404);
        });

        it("rejects moving an expense to a category from a different event", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const otherEvent = await setupEvent(club.id);
            const { user: admin, cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const category = await setupCategory(event.id);
            const foreignCategory = await setupCategory(otherEvent.id);
            const expense = await setupExpense(event.id, category.id, admin.id, 50);

            const res = await app.request(`/api/budget/expenses/${expense.id}`, {
                method: "PUT",
                headers: { cookie },
                body: JSON.stringify({ categoryId: foreignCategory.id, amount: 50, description: "Moved" })
            });
            expect(res.status).toBe(400);
        });

        it("allows an admin to delete an expense", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: admin, cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const category = await setupCategory(event.id);
            const expense = await setupExpense(event.id, category.id, admin.id, 50);

            const res = await app.request(`/api/budget/expenses/${expense.id}`, {
                method: "DELETE",
                headers: { cookie }
            });
            expect(res.status).toBe(200);

            const deleted = await harness.db.query.expensesTable.findFirst({ where: { id: expense.id } });
            expect(deleted).toBeUndefined();
        });

        it("allows a standard user to update and delete their own expense", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: member, cookie } = await harness.setupUser("standard@test.com", "standard", club.id, "Standard");
            const category = await setupCategory(event.id);
            const expense = await setupExpense(event.id, category.id, member.id, 50, "Original");

            const updateRes = await app.request(`/api/budget/expenses/${expense.id}`, {
                method: "PUT",
                headers: { cookie },
                body: JSON.stringify({ categoryId: category.id, amount: 60, description: "Updated" })
            });
            expect(updateRes.status).toBe(200);
            expect((await updateRes.json() as Expense).amount).toBe(60);

            const deleteRes = await app.request(`/api/budget/expenses/${expense.id}`, {
                method: "DELETE",
                headers: { cookie }
            });
            expect(deleteRes.status).toBe(200);
        });

        it.each(["PUT", "DELETE"])("prevents a standard user from %s on someone else's expense", async (method) => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: admin } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const { cookie } = await harness.setupUser("standard@test.com", "standard", club.id, "Standard");
            const category = await setupCategory(event.id);
            const expense = await setupExpense(event.id, category.id, admin.id, 50);

            const res = await app.request(`/api/budget/expenses/${expense.id}`, {
                method,
                headers: { cookie },
                body: method === "PUT" ? JSON.stringify({ categoryId: category.id, amount: 1, description: "Hijack" }) : undefined
            });
            expect(res.status).toBe(404);

            const unchanged = await harness.db.query.expensesTable.findFirst({ where: { id: expense.id } });
            expect(unchanged?.amount).toBe(50);
        });

        it.each(["PUT", "DELETE"])("allows an exec to %s a member's expense", async (method) => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { cookie } = await harness.setupUser("exec@test.com", "exec", club.id, "Exec");
            const { user: member } = await harness.setupUser("standard@test.com", "standard", club.id, "Standard");
            const category = await setupCategory(event.id);
            const expense = await setupExpense(event.id, category.id, member.id, 50);

            const res = await app.request(`/api/budget/expenses/${expense.id}`, {
                method,
                headers: { cookie },
                body: method === "PUT" ? JSON.stringify({ categoryId: category.id, amount: 70, description: "Corrected" }) : undefined
            });
            expect(res.status).toBe(200);

            const after = await harness.db.query.expensesTable.findFirst({ where: { id: expense.id } });
            if (method === "PUT") {
                expect(after?.amount).toBe(70);
                expect(after?.createdBy).toBe(member.id);
            } else {
                expect(after).toBeUndefined();
            }
        });

        it("prevents a standard user from deleting an expense in another club", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const otherClub = await harness.setupClub("Other Club");
            const otherEvent = await setupEvent(otherClub.id);
            const { user: otherMember } = await harness.setupUser("other@test.com", "standard", otherClub.id, "Other");
            const { cookie } = await harness.setupUser("standard@test.com", "standard", club.id, "Standard");
            const foreignCategory = await setupCategory(otherEvent.id);
            const expense = await setupExpense(otherEvent.id, foreignCategory.id, otherMember.id, 50);

            const res = await app.request(`/api/budget/expenses/${expense.id}`, {
                method: "DELETE",
                headers: { cookie }
            });
            expect(res.status).toBe(404);

            const unchanged = await harness.db.query.expensesTable.findFirst({ where: { id: expense.id } });
            expect(unchanged).not.toBeUndefined();
        });

        it("returns 404 for an expense that does not exist", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");

            const res = await app.request("/api/budget/expenses/99999", {
                method: "DELETE",
                headers: { cookie }
            });
            expect(res.status).toBe(404);
        });
    });

    describe("GET /api/budget/spending (dashboard)", () => {
        it("prevents standard users from viewing club-wide spending", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("standard@test.com", "standard", club.id, "Standard");

            const res = await app.request("/api/budget/spending", { headers: { cookie } });
            expect(res.status).toBe(403);
        });

        it("aggregates allocated and spent totals per event", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const eventOne = await setupEvent(club.id);
            const eventTwo = await setupEvent(club.id);
            const { user: admin, cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const venueOne = await setupCategory(eventOne.id, "Venue", 300);
            await setupCategory(eventOne.id, "Catering", 100);
            const venueTwo = await setupCategory(eventTwo.id, "Venue", 200);

            await setupExpense(eventOne.id, venueOne.id, admin.id, 150);
            await setupExpense(eventTwo.id, venueTwo.id, admin.id, 50);

            const res = await app.request("/api/budget/spending", { headers: { cookie } });
            expect(res.status).toBe(200);
            const body = await res.json() as EventSpending[];

            const first = body.find((entry) => entry.eventId === eventOne.id);
            const second = body.find((entry) => entry.eventId === eventTwo.id);

            expect(first?.totalAllocated).toBe(400);
            expect(first?.totalSpent).toBe(150);
            expect(second?.totalAllocated).toBe(200);
            expect(second?.totalSpent).toBe(50);
        });

        it("allows an exec to view spending", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("exec@test.com", "exec", club.id, "Exec");

            const res = await app.request("/api/budget/spending", { headers: { cookie } });
            expect(res.status).toBe(200);
        });

        it("includes events with allocations but no expenses", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            await setupCategory(event.id, "Venue", 120);

            const res = await app.request("/api/budget/spending", { headers: { cookie } });
            const body = await res.json() as EventSpending[];

            expect(body.length).toBe(1);
            expect(body[0]).toMatchObject({ eventId: event.id, totalAllocated: 120, totalSpent: 0 });
        });

        it("orders events newest first and includes archived events", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const older = await setupEvent(club.id, { name: "Older", start: new Date("2026-01-01T10:00:00Z"), archived: true });
            const newer = await setupEvent(club.id, { name: "Newer", start: new Date("2026-06-01T10:00:00Z") });
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            await setupCategory(older.id, "Venue", 10);
            await setupCategory(newer.id, "Venue", 20);

            const res = await app.request("/api/budget/spending", { headers: { cookie } });
            const body = await res.json() as EventSpending[];

            expect(body.map((entry) => [entry.name, entry.archived])).toEqual([
                ["Newer", false],
                ["Older", true]
            ]);
        });

        it("omits events with no budget activity", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            await setupEvent(club.id);
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");

            const res = await app.request("/api/budget/spending", { headers: { cookie } });
            expect(res.status).toBe(200);
            const body = await res.json() as EventSpending[];
            expect(body).toEqual([]);
        });

        it("does not include events from another club", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const otherClub = await harness.setupClub("Other Club");
            const otherEvent = await setupEvent(otherClub.id);
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            await setupCategory(otherEvent.id, "Foreign Category", 100);

            const res = await app.request("/api/budget/spending", { headers: { cookie } });
            expect(res.status).toBe(200);
            const body = await res.json() as EventSpending[];
            expect(body).toEqual([]);
        });
    });
});
