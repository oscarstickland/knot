import { describe, it, expect } from "bun:test";
import { formatCurrency, netPosition } from "../../src/lib/currency.ts";

describe("formatCurrency", () => {
    it("formats to two decimal places", () => {
        expect(formatCurrency(5)).toBe("$5.00");
        expect(formatCurrency(12.5)).toBe("$12.50");
    });

    it("puts the minus sign before the dollar sign", () => {
        expect(formatCurrency(-20.5)).toBe("-$20.50");
    });

    it("formats zero without a sign", () => {
        expect(formatCurrency(0)).toBe("$0.00");
    });
});

describe("netPosition", () => {
    it("is income minus spending", () => {
        expect(netPosition(500, 320)).toBe(180);
    });

    it("is negative when spending exceeds income", () => {
        expect(netPosition(100, 250)).toBe(-150);
    });

    it("avoids floating point drift", () => {
        expect(netPosition(0.3, 0.1)).toBe(0.2);
    });
});
