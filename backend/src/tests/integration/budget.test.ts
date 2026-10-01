import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect } from "bun:test";
import { type TestDatabaseHarness, setupHarness } from "../harness.ts";
import { budgetCategoriesTable, eventBudgetsTable, eventsTable, expensesTable } from "../../db/schema.ts";
import type { BudgetCategory, CategorySpending, EventBudgetSummary, Expense } from "../../types/budget.ts";

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

    async function setupEvent(clubId: number) {
        const referenceDate = new Date();
        const [event] = await harness.db
            .insert(eventsTable)
            .values({ name: "Event", location: "Main Hall", start: referenceDate, end: new Date(referenceDate.valueOf() + 5000), clubId })
            .returning();
        if (!event) throw new Error("Event returned is null");
        return event;
    }

    async function setupCategory(clubId: number, name: string = "Venue") {
        const [category] = await harness.db
            .insert(budgetCategoriesTable)
            .values({ clubId, name })
            .returning();
        if (!category) throw new Error("Category returned is null");
        return category;
    }

    async function setupAllocation(eventId: number, categoryId: number, allocatedAmount: number) {
        const [allocation] = await harness.db
            .insert(eventBudgetsTable)
            .values({ eventId, categoryId, allocatedAmount })
            .returning();
        if (!allocation) throw new Error("Allocation returned is null");
        return allocation;
    }

    async function setupExpense(eventId: number, categoryId: number, createdBy: number, amount: number, description: string = "Expense") {
        const [expense] = await harness.db
            .insert(expensesTable)
            .values({ eventId, categoryId, createdBy, amount, description })
            .returning();
        if (!expense) throw new Error("Expense returned is null");
        return expense;
    }

    describe("POST /api/budget/categories (create)", () => {
        it("prevents non-admin users from creating a category", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("exec@test.com", "exec", club.id, "Exec");

            const res = await app.request("/api/budget/categories", {
                method: "POST",
                headers: { cookie },
                body: JSON.stringify({ name: "Venue" })
            });
            expect(res.status).toBe(403);
        });

        it("allows an admin to create a category", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");

            const res = await app.request("/api/budget/categories", {
                method: "POST",
                headers: { cookie },
                body: JSON.stringify({ name: "Venue" })
            });
            expect(res.status).toBe(201);

            const created = await harness.db.query.budgetCategoriesTable.findFirst({ where: { clubId: club.id } });
            expect(created?.name).toBe("Venue");
        });

        it("rejects a duplicate category name within the same club", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            await setupCategory(club.id, "Venue");

            const res = await app.request("/api/budget/categories", {
                method: "POST",
                headers: { cookie },
                body: JSON.stringify({ name: "Venue" })
            });
            expect(res.status).toBe(400);
        });
    });

    describe("PUT /api/budget/categories/:id (update)", () => {
        it("prevents non-admin users from renaming a category", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("exec@test.com", "exec", club.id, "Exec");
            const category = await setupCategory(club.id, "Venue");

            const res = await app.request(`/api/budget/categories/${category.id}`, {
                method: "PUT",
                headers: { cookie },
                body: JSON.stringify({ name: "Renamed" })
            });
            expect(res.status).toBe(403);
        });

        it("allows an admin to rename a category", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const category = await setupCategory(club.id, "Venue");

            const res = await app.request(`/api/budget/categories/${category.id}`, {
                method: "PUT",
                headers: { cookie },
                body: JSON.stringify({ name: "Renamed" })
            });
            expect(res.status).toBe(200);
            const body = await res.json() as BudgetCategory;
            expect(body.name).toBe("Renamed");
        });

        it("prevents renaming a category from a different club", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const otherClub = await harness.setupClub("Other Club");
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const foreignCategory = await setupCategory(otherClub.id, "Venue");

            const res = await app.request(`/api/budget/categories/${foreignCategory.id}`, {
                method: "PUT",
                headers: { cookie },
                body: JSON.stringify({ name: "Renamed" })
            });
            expect(res.status).toBe(404);
        });
    });

    describe("DELETE /api/budget/categories/:id", () => {
        it("prevents non-admin users from deleting a category", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("exec@test.com", "exec", club.id, "Exec");
            const category = await setupCategory(club.id, "Venue");

            const res = await app.request(`/api/budget/categories/${category.id}`, {
                method: "DELETE",
                headers: { cookie }
            });
            expect(res.status).toBe(403);
        });

        it("allows an admin to delete an unused category", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const category = await setupCategory(club.id, "Venue");

            const res = await app.request(`/api/budget/categories/${category.id}`, {
                method: "DELETE",
                headers: { cookie }
            });
            expect(res.status).toBe(200);

            const deleted = await harness.db.query.budgetCategoriesTable.findFirst({ where: { id: category.id } });
            expect(deleted).toBeUndefined();
        });

        it("prevents deleting a category that is allocated to an event", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const category = await setupCategory(club.id, "Venue");
            await setupAllocation(event.id, category.id, 100);

            const res = await app.request(`/api/budget/categories/${category.id}`, {
                method: "DELETE",
                headers: { cookie }
            });
            expect(res.status).toBe(409);

            const stillExists = await harness.db.query.budgetCategoriesTable.findFirst({ where: { id: category.id } });
            expect(stillExists).not.toBeUndefined();
        });

        it("prevents deleting a category that has expenses logged against it", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: admin, cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const category = await setupCategory(club.id, "Venue");
            await setupExpense(event.id, category.id, admin.id, 50);

            const res = await app.request(`/api/budget/categories/${category.id}`, {
                method: "DELETE",
                headers: { cookie }
            });
            expect(res.status).toBe(409);
        });
    });

    describe("PUT /api/events/:id/budget (assign)", () => {
        it("prevents standard users from assigning a budget", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const category = await setupCategory(club.id);
            const { cookie } = await harness.setupUser("standard@test.com", "standard", club.id, "Standard");

            const res = await app.request(`/api/events/${event.id}/budget`, {
                method: "PUT",
                headers: { cookie },
                body: JSON.stringify({ allocations: [{ categoryId: category.id, allocatedAmount: 100 }] })
            });
            expect(res.status).toBe(403);
        });

        it.each(["exec", "admin"])("allows %s to assign category allocations to an event", async (role) => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const category = await setupCategory(club.id);
            const { cookie } = await harness.setupUser("actor@test.com", role, club.id, "Actor");

            const res = await app.request(`/api/events/${event.id}/budget`, {
                method: "PUT",
                headers: { cookie },
                body: JSON.stringify({ allocations: [{ categoryId: category.id, allocatedAmount: 250 }] })
            });
            expect(res.status).toBe(200);

            const allocations = await harness.db.query.eventBudgetsTable.findMany({ where: { eventId: event.id } });
            expect(allocations.length).toBe(1);
            expect(allocations[0]!.allocatedAmount).toBe(250);
        });

        it("prevents assigning a category from a different club", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const otherClub = await harness.setupClub("Other Club");
            const event = await setupEvent(club.id);
            const foreignCategory = await setupCategory(otherClub.id);
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");

            const res = await app.request(`/api/events/${event.id}/budget`, {
                method: "PUT",
                headers: { cookie },
                body: JSON.stringify({ allocations: [{ categoryId: foreignCategory.id, allocatedAmount: 100 }] })
            });
            expect(res.status).toBe(400);
        });

        it("replaces existing allocations rather than appending to them", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const category = await setupCategory(club.id, "Venue");
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            await setupAllocation(event.id, category.id, 100);

            const secondCategory = await setupCategory(club.id, "Catering");
            const res = await app.request(`/api/events/${event.id}/budget`, {
                method: "PUT",
                headers: { cookie },
                body: JSON.stringify({ allocations: [{ categoryId: secondCategory.id, allocatedAmount: 400 }] })
            });
            expect(res.status).toBe(200);

            const allocations = await harness.db.query.eventBudgetsTable.findMany({ where: { eventId: event.id } });
            expect(allocations.length).toBe(1);
            expect(allocations[0]!.categoryId).toBe(secondCategory.id);
        });
    });

    describe("GET /api/events/:id/budget (summary)", () => {
        it("returns allocations with spent totals and expenses", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: admin, cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const category = await setupCategory(club.id, "Venue");
            await setupAllocation(event.id, category.id, 500);
            await setupExpense(event.id, category.id, admin.id, 120, "Deposit");
            await setupExpense(event.id, category.id, admin.id, 80, "Cleaning fee");

            const res = await app.request(`/api/events/${event.id}/budget`, { headers: { cookie } });
            expect(res.status).toBe(200);
            const body = await res.json() as EventBudgetSummary;

            expect(body.totalAllocated).toBe(500);
            expect(body.totalSpent).toBe(200);
            expect(body.allocations[0]!.spent).toBe(200);
            expect(body.expenses.length).toBe(2);
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
    });

    describe("POST /api/events/:id/expenses (create)", () => {
        it("prevents standard users from logging an expense", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const category = await setupCategory(club.id);
            const { cookie } = await harness.setupUser("standard@test.com", "standard", club.id, "Standard");

            const res = await app.request(`/api/events/${event.id}/expenses`, {
                method: "POST",
                headers: { cookie },
                body: JSON.stringify({ categoryId: category.id, amount: 50, description: "Snacks" })
            });
            expect(res.status).toBe(403);
        });

        it.each(["exec", "admin"])("allows %s to log an expense", async (role) => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const category = await setupCategory(club.id);
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

        it("rejects a category belonging to a different club", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const otherClub = await harness.setupClub("Other Club");
            const event = await setupEvent(club.id);
            const foreignCategory = await setupCategory(otherClub.id);
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");

            const res = await app.request(`/api/events/${event.id}/expenses`, {
                method: "POST",
                headers: { cookie },
                body: JSON.stringify({ categoryId: foreignCategory.id, amount: 50, description: "Snacks" })
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
            const category = await setupCategory(club.id);
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
            const foreignCategory = await setupCategory(otherClub.id);
            const expense = await setupExpense(otherEvent.id, foreignCategory.id, otherAdmin.id, 50);

            const res = await app.request(`/api/budget/expenses/${expense.id}`, {
                method: "PUT",
                headers: { cookie },
                body: JSON.stringify({ categoryId: foreignCategory.id, amount: 75, description: "Updated" })
            });
            expect(res.status).toBe(404);
        });

        it("allows an admin to delete an expense", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: admin, cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const category = await setupCategory(club.id);
            const expense = await setupExpense(event.id, category.id, admin.id, 50);

            const res = await app.request(`/api/budget/expenses/${expense.id}`, {
                method: "DELETE",
                headers: { cookie }
            });
            expect(res.status).toBe(200);

            const deleted = await harness.db.query.expensesTable.findFirst({ where: { id: expense.id } });
            expect(deleted).toBeUndefined();
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

        it("aggregates allocated and spent totals per category across events", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const eventOne = await setupEvent(club.id);
            const eventTwo = await setupEvent(club.id);
            const { user: admin, cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            const venue = await setupCategory(club.id, "Venue");
            const catering = await setupCategory(club.id, "Catering");

            await setupAllocation(eventOne.id, venue.id, 300);
            await setupAllocation(eventTwo.id, venue.id, 200);
            await setupAllocation(eventOne.id, catering.id, 100);

            await setupExpense(eventOne.id, venue.id, admin.id, 150);
            await setupExpense(eventTwo.id, venue.id, admin.id, 50);

            const res = await app.request("/api/budget/spending", { headers: { cookie } });
            expect(res.status).toBe(200);
            const body = await res.json() as CategorySpending[];

            const venueSpending = body.find((entry) => entry.categoryId === venue.id);
            const cateringSpending = body.find((entry) => entry.categoryId === catering.id);

            expect(venueSpending?.totalAllocated).toBe(500);
            expect(venueSpending?.totalSpent).toBe(200);
            expect(cateringSpending?.totalAllocated).toBe(100);
            expect(cateringSpending?.totalSpent).toBe(0);
        });

        it("does not include categories from another club", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const otherClub = await harness.setupClub("Other Club");
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "Admin");
            await setupCategory(otherClub.id, "Foreign Category");

            const res = await app.request("/api/budget/spending", { headers: { cookie } });
            expect(res.status).toBe(200);
            const body = await res.json() as CategorySpending[];
            expect(body).toEqual([]);
        });
    });
});
