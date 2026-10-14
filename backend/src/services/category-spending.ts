import type { CategorySpending, CategorySpendingEvent, CategorySpendingSummary } from "../types/budget.ts";

// One row of a grouped sum, keyed by normalised category name and event. Postgres returns sums as strings.
export type CategoryTotalRow = {
    key: string;
    name: string;
    eventId: number;
    total: string;
};

type SpendingEventSource = {
    id: number;
    name: string;
    start: Date;
};

type CategoryEventTotals = {
    name: string;
    allocated: number;
    spent: number;
};

function roundCents(amount: number): number {
    return Math.round(amount * 100) / 100;
}

function sum(amounts: number[]): number {
    return roundCents(amounts.reduce((total, amount) => total + amount, 0));
}

function indexRows(
    allocationRows: CategoryTotalRow[],
    spendRows: CategoryTotalRow[]
): Map<string, Map<number, CategoryEventTotals>> {
    const byCategory = new Map<string, Map<number, CategoryEventTotals>>();

    const addRow = (row: CategoryTotalRow, field: "allocated" | "spent") => {
        const byEvent = byCategory.get(row.key) ?? new Map<number, CategoryEventTotals>();
        const existing = byEvent.get(row.eventId) ?? { name: row.name, allocated: 0, spent: 0 };
        byEvent.set(row.eventId, { ...existing, [field]: Number(row.total) });
        byCategory.set(row.key, byEvent);
    };

    allocationRows.forEach((row) => addRow(row, "allocated"));
    spendRows.forEach((row) => addRow(row, "spent"));
    return byCategory;
}

function compareCategories(a: CategorySpending, b: CategorySpending): number {
    return b.totalSpent - a.totalSpent
        || b.totalAllocated - a.totalAllocated
        || a.name.localeCompare(b.name);
}

/**
 * Combines per-(category, event) allocation and spend totals into club-wide categories.
 *
 * Allocations and spend are summed in separate queries, because joining expenses onto categories
 * would repeat each category's allocation once per expense.
 *
 * @param events The club's events, newest first. Rows for any other event are ignored.
 */
export function summariseCategorySpending(
    events: SpendingEventSource[],
    allocationRows: CategoryTotalRow[],
    spendRows: CategoryTotalRow[]
): CategorySpendingSummary {
    const byCategory = indexRows(allocationRows, spendRows);

    const categories = [...byCategory.entries()]
        .map(([key, byEvent]): CategorySpending | null => {
            const categoryEvents = events
                .filter((event) => byEvent.has(event.id))
                .map((event): CategorySpendingEvent & { categoryName: string } => {
                    const totals = byEvent.get(event.id)!;
                    return {
                        eventId: event.id,
                        name: event.name,
                        start: event.start.toISOString(),
                        allocated: totals.allocated,
                        spent: totals.spent,
                        categoryName: totals.name
                    };
                });
            if (categoryEvents.length === 0) return null;

            return {
                key,
                name: categoryEvents[0]!.categoryName,
                totalAllocated: sum(categoryEvents.map((event) => event.allocated)),
                totalSpent: sum(categoryEvents.map((event) => event.spent)),
                events: categoryEvents.map(({ categoryName: _, ...event }) => event)
            };
        })
        .filter((category): category is CategorySpending => category !== null)
        .sort(compareCategories);

    return {
        categories,
        totalAllocated: sum(categories.map((category) => category.totalAllocated)),
        totalSpent: sum(categories.map((category) => category.totalSpent))
    };
}
