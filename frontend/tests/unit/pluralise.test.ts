import { describe, it, expect } from "bun:test";
import { pluralise } from "../../src/lib/pluralise.ts";

describe("pluralise", () => {
    it("uses the plural form for zero", () => {
        expect(pluralise(0, "active event")).toBe("0 active events");
    });

    it("uses the singular form for one", () => {
        expect(pluralise(1, "active event")).toBe("1 active event");
    });

    it("uses the plural form for more than one", () => {
        expect(pluralise(2, "active event")).toBe("2 active events");
    });

    it("uses a custom plural form when given", () => {
        expect(pluralise(3, "category", "categories")).toBe("3 categories");
        expect(pluralise(1, "category", "categories")).toBe("1 category");
    });
});
