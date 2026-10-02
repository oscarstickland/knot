import { describe, it, expect } from "bun:test";
import { SetEventBudgetSchema } from "../../types/budget.ts";

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
