import { describe, it, expect } from "bun:test";
import {
    AT_RISK_LIMIT,
    classifyAuditEntry,
    getEventPhase,
    mergeActivity,
    summariseBudget,
    summariseTasks,
    type OverviewTaskInput
} from "../../services/event-overview.ts";
import type { OverviewActivity } from "../../types/event-overview.ts";

const NOW = new Date("2026-08-10T12:00:00Z");
const daysFromNow = (days: number) => new Date(NOW.getTime() + days * 86_400_000);

let nextId = 1;
function task(overrides: Partial<OverviewTaskInput> = {}): OverviewTaskInput {
    const id = nextId++;
    return {
        id,
        title: `Task ${id}`,
        progress: "backlog",
        dueDate: null,
        assignees: [],
        prerequisiteIds: [],
        completedAt: null,
        ...overrides
    };
}

describe("getEventPhase", () => {
    const event = { start: daysFromNow(1), end: daysFromNow(2) };

    it("is upcoming before the start", () => {
        expect(getEventPhase(event, NOW)).toBe("upcoming");
    });

    it("is live from the start through the end", () => {
        expect(getEventPhase(event, event.start)).toBe("live");
        expect(getEventPhase(event, event.end)).toBe("live");
    });

    it("is past once the event has ended", () => {
        expect(getEventPhase(event, daysFromNow(3))).toBe("past");
    });
});

describe("summariseTasks", () => {
    it("handles an event with no tasks", () => {
        const summary = summariseTasks([], NOW);
        expect(summary.total).toBe(0);
        expect(summary.atRisk).toEqual([]);
        expect(summary.completion).toEqual({ onTime: 0, late: 0, noDueDate: 0, lateTitles: [] });
    });

    it("counts completed, overdue and blocked tasks", () => {
        const prerequisite = task({ progress: "in_progress", dueDate: daysFromNow(3) });
        const tasks = [
            task({ progress: "completed" }),
            task({ dueDate: daysFromNow(-2) }),
            task({ prerequisiteIds: [prerequisite.id] }),
            prerequisite
        ];

        const summary = summariseTasks(tasks, NOW);

        expect(summary.total).toBe(4);
        expect(summary.completed).toBe(1);
        expect(summary.overdue).toBe(1);
        expect(summary.blocked).toBe(1);
    });

    it("does not count completed tasks as overdue even when their due date has passed", () => {
        const summary = summariseTasks([task({ progress: "completed", dueDate: daysFromNow(-5) })], NOW);
        expect(summary.overdue).toBe(0);
        expect(summary.atRiskCount).toBe(0);
    });

    it("does not treat a task as blocked once its prerequisites are complete", () => {
        const prerequisite = task({ progress: "completed" });
        const summary = summariseTasks([prerequisite, task({ prerequisiteIds: [prerequisite.id] })], NOW);
        expect(summary.blocked).toBe(0);
    });

    it("ignores prerequisites that are no longer part of the event", () => {
        const summary = summariseTasks([task({ prerequisiteIds: [99999] })], NOW);
        expect(summary.blocked).toBe(0);
    });

    it("flags overdue tasks as at risk", () => {
        const overdue = task({ title: "Confirm numbers", dueDate: daysFromNow(-6) });
        const summary = summariseTasks([overdue], NOW);

        expect(summary.atRisk).toHaveLength(1);
        expect(summary.atRisk[0]).toMatchObject({ id: overdue.id, status: "overdue", waitingOn: [] });
    });

    it("flags a task as at risk when it is waiting on an overdue prerequisite", () => {
        const prerequisite = task({ title: "Design poster", dueDate: daysFromNow(-1) });
        const blocked = task({ title: "Print posters", dueDate: daysFromNow(2), prerequisiteIds: [prerequisite.id] });

        const summary = summariseTasks([blocked, prerequisite], NOW);

        const entry = summary.atRisk.find((risk) => risk.id === blocked.id);
        expect(entry).toMatchObject({ status: "blocked", waitingOn: ["Design poster"] });
    });

    it("does not flag a task waiting only on a prerequisite that is not overdue", () => {
        const prerequisite = task({ progress: "in_progress", dueDate: daysFromNow(4) });
        const waiting = task({ prerequisiteIds: [prerequisite.id] });

        const summary = summariseTasks([prerequisite, waiting], NOW);

        expect(summary.atRisk).toEqual([]);
        expect(summary.blocked).toBe(1);
    });

    it("reports an overdue task as overdue even when it is also blocked", () => {
        const prerequisite = task({ dueDate: daysFromNow(-3) });
        const both = task({ dueDate: daysFromNow(-1), prerequisiteIds: [prerequisite.id] });

        const summary = summariseTasks([prerequisite, both], NOW);

        expect(summary.atRisk.find((risk) => risk.id === both.id)?.status).toBe("overdue");
    });

    it("lists overdue tasks before blocked ones, earliest due first, and caps the list", () => {
        const lateOverdue = task({ dueDate: daysFromNow(-1) });
        const earlyOverdue = task({ dueDate: daysFromNow(-9) });
        const blocker = task({ dueDate: daysFromNow(-2) });
        const blocked = task({ dueDate: daysFromNow(1), prerequisiteIds: [blocker.id] });
        const filler = Array.from({ length: AT_RISK_LIMIT }, () => task({ dueDate: daysFromNow(-3) }));

        const summary = summariseTasks([blocked, lateOverdue, blocker, earlyOverdue, ...filler], NOW);

        expect(summary.atRisk[0]!.id).toBe(earlyOverdue.id);
        expect(summary.atRisk).toHaveLength(AT_RISK_LIMIT);
        expect(summary.atRiskCount).toBe(filler.length + 4);
        expect(summary.atRisk.every((risk) => risk.status === "overdue")).toBe(true);
    });

    describe("completion breakdown", () => {
        it("splits completed tasks into on time, late and no due date", () => {
            const due = daysFromNow(-5);
            const tasks = [
                task({ progress: "completed", dueDate: due, completedAt: daysFromNow(-6) }),
                task({ progress: "completed", dueDate: due, completedAt: due }),
                task({ title: "Order marquee", progress: "completed", dueDate: due, completedAt: daysFromNow(-4) }),
                task({ progress: "completed" })
            ];

            const { completion } = summariseTasks(tasks, NOW);

            expect(completion.onTime).toBe(2);
            expect(completion.late).toBe(1);
            expect(completion.noDueDate).toBe(1);
            expect(completion.lateTitles).toEqual(["Order marquee"]);
        });

        it("gives completed tasks with no recorded completion time the benefit of the doubt", () => {
            const { completion } = summariseTasks(
                [task({ progress: "completed", dueDate: daysFromNow(-5), completedAt: null })],
                NOW
            );
            expect(completion).toMatchObject({ onTime: 1, late: 0 });
        });

        it("ignores unfinished tasks", () => {
            const { completion } = summariseTasks([task({ dueDate: daysFromNow(-5) })], NOW);
            expect(completion).toEqual({ onTime: 0, late: 0, noDueDate: 0, lateTitles: [] });
        });
    });
});

describe("summariseBudget", () => {
    it("totals income and spending and works out the net position", () => {
        const budget = summariseBudget({
            totalAllocated: 1000,
            income: [{ amount: 640, source: "Takings" }, { amount: 460, source: "Grant" }],
            expenses: [
                { amount: 610, categoryName: "Catering", paidPersonally: false, reimbursedAt: null },
                { amount: 280, categoryName: "Hire", paidPersonally: false, reimbursedAt: null }
            ]
        });

        expect(budget).toMatchObject({ totalIncome: 1100, totalSpent: 890, net: 210, totalAllocated: 1000 });
    });

    it("reports a deficit as a negative net", () => {
        const budget = summariseBudget({
            totalAllocated: 0,
            income: [{ amount: 50, source: "Takings" }],
            expenses: [{ amount: 80, categoryName: "Catering", paidPersonally: false, reimbursedAt: null }]
        });
        expect(budget.net).toBe(-30);
    });

    it("avoids floating point drift when summing cents", () => {
        const budget = summariseBudget({
            totalAllocated: 0,
            income: [],
            expenses: [
                { amount: 0.1, categoryName: "A", paidPersonally: false, reimbursedAt: null },
                { amount: 0.2, categoryName: "A", paidPersonally: false, reimbursedAt: null }
            ]
        });
        expect(budget.totalSpent).toBe(0.3);
    });

    it("only counts unreimbursed personal expenses as owed", () => {
        const budget = summariseBudget({
            totalAllocated: 0,
            income: [],
            expenses: [
                { amount: 40, categoryName: "Food", paidPersonally: true, reimbursedAt: null },
                { amount: 25, categoryName: "Food", paidPersonally: true, reimbursedAt: new Date() },
                { amount: 100, categoryName: "Food", paidPersonally: false, reimbursedAt: null }
            ]
        });
        expect(budget).toMatchObject({ totalOwed: 40, owedClaims: 1 });
    });

    it("groups line items by label, largest first", () => {
        const budget = summariseBudget({
            totalAllocated: 0,
            income: [{ amount: 10, source: "Grant" }, { amount: 90, source: "Takings" }, { amount: 5, source: "Grant" }],
            expenses: [
                { amount: 20, categoryName: "Hire", paidPersonally: false, reimbursedAt: null },
                { amount: 30, categoryName: "Hire", paidPersonally: false, reimbursedAt: null }
            ]
        });

        expect(budget.incomeLines).toEqual([{ label: "Takings", amount: 90 }, { label: "Grant", amount: 15 }]);
        expect(budget.expenseLines).toEqual([{ label: "Hire", amount: 50 }]);
    });
});

describe("classifyAuditEntry", () => {
    it("treats created entries as task creation", () => {
        expect(classifyAuditEntry({ action: "created", changes: { title: "x" } })).toEqual({ kind: "task_created", progress: null });
    });

    it("reads the new progress from progress changes", () => {
        expect(classifyAuditEntry({ action: "updated", changes: { progress: "completed" } }))
            .toEqual({ kind: "task_progress", progress: "completed" });
    });

    it("recognises an added document link", () => {
        expect(classifyAuditEntry({ action: "updated", changes: { addedDocumentUrl: "https://example.com" } }).kind).toBe("task_link");
    });

    it("falls back to a generic edit for anything else, including malformed changes", () => {
        expect(classifyAuditEntry({ action: "updated", changes: { title: "New" } }).kind).toBe("task_edited");
        expect(classifyAuditEntry({ action: "updated", changes: null }).kind).toBe("task_edited");
        expect(classifyAuditEntry({ action: "updated", changes: "oops" }).kind).toBe("task_edited");
    });
});

describe("mergeActivity", () => {
    function item(key: string, at: Date): OverviewActivity {
        return { key, kind: "comment", actorName: "A", subject: "S", amount: null, progress: null, at };
    }

    it("merges sources newest first", () => {
        const merged = mergeActivity([
            [item("a", daysFromNow(-3)), item("b", daysFromNow(-1))],
            [item("c", daysFromNow(-2))]
        ]);
        expect(merged.map((entry) => entry.key)).toEqual(["b", "c", "a"]);
    });

    it("limits the result", () => {
        const many = Array.from({ length: 20 }, (_, index) => item(`k${index}`, daysFromNow(-index)));
        expect(mergeActivity([many], 5)).toHaveLength(5);
    });

    it("keeps a stable order for entries with the same timestamp", () => {
        const merged = mergeActivity([[item("b", NOW), item("a", NOW)]]);
        expect(merged.map((entry) => entry.key)).toEqual(["a", "b"]);
    });
});
