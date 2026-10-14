import { describe, it, expect } from "bun:test";
import { formatCurrency, OTHER_SHARE_KEY, percentUsed, spendShares } from "../../src/lib/categorySpending.ts";

function category(key: string, totalSpent: number) {
    return { key, name: key.toUpperCase(), totalSpent };
}

describe("formatCurrency", () => {
    it("formats to two decimal places with a dollar sign", () => {
        expect(formatCurrency(0)).toBe("$0.00");
        expect(formatCurrency(30.3)).toBe("$30.30");
    });
});

describe("percentUsed", () => {
    it("returns the rounded percentage of the allocation that has been spent", () => {
        expect(percentUsed(40, 160)).toBe(25);
        expect(percentUsed(1, 3)).toBe(33);
    });

    it("can exceed 100 when a category is over budget", () => {
        expect(percentUsed(150, 100)).toBe(150);
    });

    it("returns null when nothing was allocated", () => {
        expect(percentUsed(0, 0)).toBeNull();
        expect(percentUsed(25, 0)).toBeNull();
    });
});

describe("spendShares", () => {
    it("returns nothing when there has been no spending", () => {
        expect(spendShares([category("venue", 0), category("catering", 0)])).toEqual([]);
    });

    it("gives each category its share of total spend, in the given order", () => {
        const shares = spendShares([category("venue", 75), category("catering", 25)]);

        expect(shares).toEqual([
            { key: "venue", name: "VENUE", spent: 75, share: 75 },
            { key: "catering", name: "CATERING", spent: 25, share: 25 }
        ]);
    });

    it("leaves out categories with no spending", () => {
        const shares = spendShares([category("venue", 10), category("equipment", 0)]);

        expect(shares.map((share) => share.key)).toEqual(["venue"]);
    });

    it("keeps every category when there are no more than the limit", () => {
        const categories = [category("a", 4), category("b", 3), category("c", 2)];

        expect(spendShares(categories, 3).map((share) => share.key)).toEqual(["a", "b", "c"]);
    });

    it("merges categories beyond the limit into a single Other share", () => {
        const categories = [category("a", 50), category("b", 20), category("c", 20), category("d", 10)];

        const shares = spendShares(categories, 2);

        expect(shares.map((share) => share.key)).toEqual(["a", "b", OTHER_SHARE_KEY]);
        expect(shares[2]).toEqual({ key: OTHER_SHARE_KEY, name: "Other", spent: 30, share: 30 });
    });

    it("produces shares that add up to 100", () => {
        const shares = spendShares([category("a", 1), category("b", 1), category("c", 1)]);

        expect(shares.reduce((total, share) => total + share.share, 0)).toBeCloseTo(100);
    });
});
