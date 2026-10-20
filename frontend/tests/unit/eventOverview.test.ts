import { describe, it, expect } from "bun:test";
import {
    daysOverdue,
    describeActivity,
    describeCountdown,
    describeLateTasks,
    describeOverdue,
    describeTaskHealth,
    formatSignedCurrency,
    initials,
    turnoutPercent
} from "../../src/lib/eventOverview.ts";

const NOW = new Date("2026-08-11T09:00:00Z");
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const after = (ms: number) => new Date(NOW.getTime() + ms);

describe("describeCountdown", () => {
    it("counts whole days when a day or more remains", () => {
        expect(describeCountdown(after(6 * DAY + 3 * HOUR), NOW)).toBe("6 days");
        expect(describeCountdown(after(DAY), NOW)).toBe("1 day");
    });

    it("switches to hours inside the last day", () => {
        expect(describeCountdown(after(5 * HOUR + 10 * MINUTE), NOW)).toBe("5 hours");
        expect(describeCountdown(after(HOUR), NOW)).toBe("1 hour");
    });

    it("switches to minutes inside the last hour, never showing zero", () => {
        expect(describeCountdown(after(20 * MINUTE), NOW)).toBe("20 minutes");
        expect(describeCountdown(after(10_000), NOW)).toBe("1 minute");
    });

    it("says the event is starting once the time has come", () => {
        expect(describeCountdown(NOW, NOW)).toBe("Starting now");
        expect(describeCountdown(after(-DAY), NOW)).toBe("Starting now");
    });

    it("accepts ISO strings as sent by the API", () => {
        expect(describeCountdown(after(2 * DAY + HOUR).toISOString(), NOW)).toBe("2 days");
    });
});

describe("daysOverdue / describeOverdue", () => {
    it("returns null before the due date", () => {
        expect(daysOverdue(after(DAY), NOW)).toBeNull();
        expect(describeOverdue(after(DAY), NOW)).toBe("");
    });

    it("counts whole days past the due date", () => {
        expect(daysOverdue(after(-6 * DAY - HOUR), NOW)).toBe(6);
        expect(describeOverdue(after(-6 * DAY - HOUR), NOW)).toBe("6 days overdue");
        expect(describeOverdue(after(-DAY), NOW)).toBe("1 day overdue");
    });

    it("says overdue today when less than a day late", () => {
        expect(describeOverdue(after(-3 * HOUR), NOW)).toBe("overdue today");
    });
});

describe("describeTaskHealth", () => {
    const base = { total: 18, completed: 12 };

    it("lists blocked and overdue counts", () => {
        expect(describeTaskHealth({ ...base, blocked: 2, overdue: 1 })).toBe("2 blocked, 1 overdue");
        expect(describeTaskHealth({ ...base, blocked: 0, overdue: 3 })).toBe("3 overdue");
    });

    it("falls back to a calm message when nothing is wrong", () => {
        expect(describeTaskHealth({ ...base, blocked: 0, overdue: 0 })).toBe("all on track");
        expect(describeTaskHealth({ total: 0, completed: 0, blocked: 0, overdue: 0 })).toBe("no tasks yet");
        expect(describeTaskHealth({ total: 8, completed: 8, blocked: 0, overdue: 0 })).toBe("everything is done");
    });
});

describe("describeLateTasks", () => {
    const completion = (late: number) => ({ onTime: 0, late, noDueDate: 0, lateTitles: [] });

    it("reports tasks finished after their due date", () => {
        expect(describeLateTasks({ total: 8, completed: 8, completion: completion(2) })).toBe("2 finished after the due date");
    });

    it("reports open tasks when nothing was late yet", () => {
        expect(describeLateTasks({ total: 8, completed: 5, completion: completion(0) })).toBe("3 still open");
    });

    it("celebrates a clean finish", () => {
        expect(describeLateTasks({ total: 8, completed: 8, completion: completion(0) })).toBe("all finished on time");
    });
});

describe("turnoutPercent", () => {
    it("rounds the share of expected attendees who checked in", () => {
        expect(turnoutPercent(142, 160)).toBe(89);
    });

    it("can exceed 100 when more people turn up than expected", () => {
        expect(turnoutPercent(60, 40)).toBe(150);
    });

    it("returns null without a target, avoiding divide by zero", () => {
        expect(turnoutPercent(10, null)).toBeNull();
        expect(turnoutPercent(10, 0)).toBeNull();
    });
});

describe("formatSignedCurrency", () => {
    it("prefixes surpluses with a plus", () => {
        expect(formatSignedCurrency(210)).toBe("+$210.00");
    });

    it("shows deficits with a minus and zero plainly", () => {
        expect(formatSignedCurrency(-30.5)).toBe("-$30.50");
        expect(formatSignedCurrency(0)).toBe("$0.00");
    });
});

describe("initials", () => {
    it("takes the first letters of up to two words", () => {
        expect(initials("Caleb Lau")).toBe("CL");
        expect(initials("flynn")).toBe("F");
        expect(initials("Mary Jane Watson")).toBe("MJ");
    });

    it("copes with missing or blank names", () => {
        expect(initials(null)).toBe("?");
        expect(initials("   ")).toBe("?");
    });
});

describe("describeActivity", () => {
    const base = { subject: "Order catering", amount: null, progress: null };

    it("describes a completed task as ticked off", () => {
        expect(describeActivity({ ...base, kind: "task_progress", progress: "completed" }))
            .toEqual({ action: "ticked off", subject: "Order catering", suffix: "" });
    });

    it("describes other progress changes with the new state", () => {
        expect(describeActivity({ ...base, kind: "task_progress", progress: "in_review" }))
            .toEqual({ action: "moved", subject: "Order catering", suffix: "to In Review" });
    });

    it("includes the amount for money activity", () => {
        expect(describeActivity({ kind: "expense", subject: "Catering", amount: 480, progress: null }))
            .toEqual({ action: "added a $480.00 expense for", subject: "Catering", suffix: "" });
        expect(describeActivity({ kind: "income", subject: "Grant", amount: 200, progress: null }).action)
            .toBe("recorded $200.00 of income from");
    });

    it.each([
        ["task_created", "created"],
        ["task_edited", "edited"],
        ["task_link", "added a link to"],
        ["comment", "commented on"],
        ["document", "added the document"]
    ] as const)("describes %s", (kind, action) => {
        expect(describeActivity({ ...base, kind }).action).toBe(action);
    });
});
