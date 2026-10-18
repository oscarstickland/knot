import { describe, it, expect } from "bun:test";
import { suggestDuplicateDefaults } from "../../src/lib/duplicateEvent";

describe("suggestDuplicateDefaults", () => {
    it("moves the event 52 weeks on, keeping its duration", () => {
        const result = suggestDuplicateDefaults({
            name: "Trivia Night",
            start: "2025-03-05T10:00:00.000Z",
            end: "2025-03-05T13:30:00.000Z"
        });

        expect(result.start).toBe("2026-03-04T10:00:00.000Z");
        expect(result.end).toBe("2026-03-04T13:30:00.000Z");
    });

    it("bumps a year in the name to the new start year", () => {
        const result = suggestDuplicateDefaults({
            name: "O-Week 2025",
            start: "2025-02-17T00:00:00.000Z",
            end: "2025-02-18T00:00:00.000Z"
        });

        expect(result.name).toBe("O-Week 2026");
    });

    it("appends (copy) when the name has no matching year", () => {
        const result = suggestDuplicateDefaults({
            name: "Welcome BBQ",
            start: new Date("2025-02-17T00:00:00.000Z"),
            end: new Date("2025-02-17T02:00:00.000Z")
        });

        expect(result.name).toBe("Welcome BBQ (copy)");
    });

    it("leaves other years in the name alone", () => {
        const result = suggestDuplicateDefaults({
            name: "Est. 1999 Reunion",
            start: "2025-02-17T00:00:00.000Z",
            end: "2025-02-17T02:00:00.000Z"
        });

        expect(result.name).toBe("Est. 1999 Reunion (copy)");
    });
});
