import { describe, it, expect } from "bun:test";
import { completedRowStyle, isTaskCompleted } from "../../src/lib/taskCompletion.ts";

const tokens = { colorSuccessBg: "#f6ffed", colorSuccess: "#52c41a" };

describe("isTaskCompleted", () => {
    it("is true only for the completed state", () => {
        expect(isTaskCompleted({ progress: "completed" })).toBe(true);
        expect(isTaskCompleted({ progress: "in_review" })).toBe(false);
        expect(isTaskCompleted({ progress: "backlog" })).toBe(false);
    });
});

describe("completedRowStyle", () => {
    it("returns no styling for incomplete tasks", () => {
        expect(completedRowStyle({ progress: "in_progress" }, tokens)).toEqual({ row: {}, firstCell: {} });
    });

    it("tints the row and accents the first cell for completed tasks", () => {
        const style = completedRowStyle({ progress: "completed" }, tokens);
        expect(style.row.background).toBe(tokens.colorSuccessBg);
        expect(style.firstCell.borderLeft).toBe(`3px solid ${tokens.colorSuccess}`);
    });
});
