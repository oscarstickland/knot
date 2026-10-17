import { describe, it, expect } from "bun:test";
import { summariseCategorySpending, type CategoryTotalRow } from "../../services/category-spending.ts";

const events = [
    { id: 2, name: "Newer", start: new Date("2026-06-01T10:00:00Z") },
    { id: 1, name: "Older", start: new Date("2026-01-01T10:00:00Z") }
];

describe("summariseCategorySpending", () => {
    it("returns empty totals when there are no rows", () => {
        expect(summariseCategorySpending(events, [], [])).toEqual({ categories: [], totalAllocated: 0, totalSpent: 0 });
    });

    it("combines allocations and spend for the same category and event", () => {
        const allocations: CategoryTotalRow[] = [{ key: "venue", name: "Venue", eventId: 1, total: "100.00" }];
        const spend: CategoryTotalRow[] = [{ key: "venue", name: "Venue", eventId: 1, total: "40.50" }];

        const summary = summariseCategorySpending(events, allocations, spend);

        expect(summary.categories).toEqual([{
            key: "venue",
            name: "Venue",
            totalAllocated: 100,
            totalSpent: 40.5,
            events: [{ eventId: 1, name: "Older", start: "2026-01-01T10:00:00.000Z", allocated: 100, spent: 40.5 }]
        }]);
    });

    it("uses the spelling from the most recent event", () => {
        const allocations: CategoryTotalRow[] = [
            { key: "venue", name: "VENUE", eventId: 1, total: "1" },
            { key: "venue", name: "Venue", eventId: 2, total: "1" }
        ];

        const summary = summariseCategorySpending(events, allocations, []);

        expect(summary.categories[0]!.name).toBe("Venue");
    });

    it("orders each category's events newest first", () => {
        const allocations: CategoryTotalRow[] = [
            { key: "venue", name: "Venue", eventId: 1, total: "1" },
            { key: "venue", name: "Venue", eventId: 2, total: "1" }
        ];

        const summary = summariseCategorySpending(events, allocations, []);

        expect(summary.categories[0]!.events.map((event) => event.eventId)).toEqual([2, 1]);
    });

    it("sorts categories by spend, then allocation, then name", () => {
        const allocations: CategoryTotalRow[] = [
            { key: "b", name: "B", eventId: 1, total: "50" },
            { key: "a", name: "A", eventId: 1, total: "50" },
            { key: "c", name: "C", eventId: 1, total: "10" }
        ];
        const spend: CategoryTotalRow[] = [{ key: "c", name: "C", eventId: 1, total: "5" }];

        const summary = summariseCategorySpending(events, allocations, spend);

        expect(summary.categories.map((category) => category.name)).toEqual(["C", "A", "B"]);
    });

    it("rounds totals to cents to avoid floating point drift across events", () => {
        const spend: CategoryTotalRow[] = [
            { key: "venue", name: "Venue", eventId: 1, total: "0.10" },
            { key: "venue", name: "Venue", eventId: 2, total: "0.20" }
        ];

        const summary = summariseCategorySpending(events, [], spend);

        expect(summary.categories[0]!.totalSpent).toBe(0.3);
        expect(summary.totalSpent).toBe(0.3);
    });

    it("ignores rows for events that are not in the given list", () => {
        const allocations: CategoryTotalRow[] = [{ key: "venue", name: "Venue", eventId: 99, total: "500" }];

        expect(summariseCategorySpending(events, allocations, []).categories).toEqual([]);
    });
});
