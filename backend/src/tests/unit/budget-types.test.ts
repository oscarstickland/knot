import { describe, it, expect } from "bun:test";
import { CategorySpendingQuerySchema, SetEventBudgetSchema } from "../../types/budget.ts";

describe("SetEventBudgetSchema", () => {
    it("accepts a mix of new and existing categories", () => {
        const parsed = SetEventBudgetSchema.safeParse({
            categories: [
                { id: 1, name: "Venue", allocatedAmount: 100 },
                { name: "Catering", allocatedAmount: 0 }
            ]
        });

        expect(parsed.success).toBe(true);
    });

    it("accepts an empty list of categories", () => {
        const parsed = SetEventBudgetSchema.safeParse({ categories: [] });
        expect(parsed.success).toBe(true);
    });

    it("trims category names", () => {
        const parsed = SetEventBudgetSchema.parse({ categories: [{ name: "  Venue  ", allocatedAmount: 1 }] });
        expect(parsed.categories[0]!.name).toBe("Venue");
    });

    it("rejects names that differ only by case", () => {
        const parsed = SetEventBudgetSchema.safeParse({
            categories: [
                { name: "Venue", allocatedAmount: 1 },
                { name: "VENUE", allocatedAmount: 2 }
            ]
        });

        expect(parsed.success).toBe(false);
        expect(parsed.error?.issues[0]?.message).toBe("Category names must be unique");
    });

    it("rejects names that only differ by surrounding whitespace", () => {
        const parsed = SetEventBudgetSchema.safeParse({
            categories: [
                { name: "Venue", allocatedAmount: 1 },
                { name: " Venue ", allocatedAmount: 2 }
            ]
        });

        expect(parsed.success).toBe(false);
    });

    it.each([
        ["a blank name", { name: "   ", allocatedAmount: 1 }],
        ["a name over 255 characters", { name: "a".repeat(256), allocatedAmount: 1 }],
        ["a negative allocation", { name: "Venue", allocatedAmount: -0.01 }],
        ["a zero id", { id: 0, name: "Venue", allocatedAmount: 1 }],
        ["a fractional id", { id: 1.5, name: "Venue", allocatedAmount: 1 }]
    ])("rejects %s", (_label, category) => {
        const parsed = SetEventBudgetSchema.safeParse({ categories: [category] });
        expect(parsed.success).toBe(false);
    });
});

describe("CategorySpendingQuerySchema", () => {
    it("accepts an empty query", () => {
        const parsed = CategorySpendingQuerySchema.safeParse({});
        expect(parsed.success).toBe(true);
    });

    it("coerces ISO strings into dates", () => {
        const parsed = CategorySpendingQuerySchema.parse({ from: "2026-01-01T00:00:00.000Z", to: "2026-12-31T00:00:00.000Z" });
        expect(parsed.from).toBeInstanceOf(Date);
        expect(parsed.to?.toISOString()).toBe("2026-12-31T00:00:00.000Z");
    });

    it("accepts a range where from equals to", () => {
        const parsed = CategorySpendingQuerySchema.safeParse({ from: "2026-01-01", to: "2026-01-01" });
        expect(parsed.success).toBe(true);
    });

    it("rejects a range where from is after to", () => {
        const parsed = CategorySpendingQuerySchema.safeParse({ from: "2026-02-01", to: "2026-01-01" });
        expect(parsed.success).toBe(false);
    });

    it("rejects a date that cannot be parsed", () => {
        const parsed = CategorySpendingQuerySchema.safeParse({ from: "not-a-date" });
        expect(parsed.success).toBe(false);
    });
});
