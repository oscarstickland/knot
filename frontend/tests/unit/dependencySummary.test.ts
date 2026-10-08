import { describe, it, expect } from "bun:test";
import { summariseDependencies, type DependencySummaryInput } from "../../src/lib/taskDependencies.ts";

type Progress = "backlog" | "in_progress" | "in_review" | "completed";

function prerequisite(id: number, progress: Progress, taskId = 100): DependencySummaryInput["dependsOn"][number] {
    return { taskId, dependsOnTaskId: id, dependsOnTask: { id, title: `Task ${id}`, progress } };
}

function dependent(id: number, progress: Progress, dependsOnTaskId = 100): DependencySummaryInput["dependents"][number] {
    return { taskId: id, dependsOnTaskId, task: { id, title: `Task ${id}`, progress } };
}

function task(overrides: Partial<DependencySummaryInput> = {}): DependencySummaryInput {
    return { progress: "in_progress", dependsOn: [], dependents: [], ...overrides };
}

describe("summariseDependencies", () => {
    it("reports nothing for a task with no links", () => {
        expect(summariseDependencies(task())).toEqual({ prerequisites: [], waitingOn: [], dependents: [], blocking: [] });
    });

    it("lists incomplete prerequisites as waiting on", () => {
        const summary = summariseDependencies(task({
            dependsOn: [prerequisite(1, "in_progress"), prerequisite(2, "completed"), prerequisite(3, "backlog")]
        }));

        expect(summary.waitingOn.map((linked) => linked.id)).toEqual([1, 3]);
        expect(summary.prerequisites).toEqual([
            { id: 1, title: "Task 1", isComplete: false },
            { id: 2, title: "Task 2", isComplete: true },
            { id: 3, title: "Task 3", isComplete: false }
        ]);
    });

    it("is not waiting on anything once every prerequisite is complete", () => {
        const summary = summariseDependencies(task({ dependsOn: [prerequisite(1, "completed")] }));

        expect(summary.waitingOn).toEqual([]);
        expect(summary.prerequisites).toHaveLength(1);
    });

    it("treats a prerequisite that could not be loaded as incomplete, matching the server's completion rule", () => {
        const summary = summariseDependencies(task({
            dependsOn: [{ taskId: 100, dependsOnTaskId: 7, dependsOnTask: null }]
        }));

        expect(summary.waitingOn).toEqual([{ id: 7, title: "Task 7", isComplete: false }]);
    });

    it("does not report waiting on prerequisites for a task that is already completed", () => {
        const summary = summariseDependencies(task({
            progress: "completed",
            dependsOn: [prerequisite(1, "in_progress")]
        }));

        expect(summary.waitingOn).toEqual([]);
    });

    it("lists incomplete dependents as blocked by this task", () => {
        const summary = summariseDependencies(task({
            dependents: [dependent(4, "backlog"), dependent(5, "completed")]
        }));

        expect(summary.blocking).toEqual([{ id: 4, title: "Task 4", isComplete: false }]);
        expect(summary.dependents).toEqual([
            { id: 4, title: "Task 4", isComplete: false },
            { id: 5, title: "Task 5", isComplete: true }
        ]);
    });

    it("is not blocking anything once the task itself is completed", () => {
        const summary = summariseDependencies(task({
            progress: "completed",
            dependents: [dependent(4, "backlog")]
        }));

        expect(summary.blocking).toEqual([]);
        expect(summary.dependents).toHaveLength(1);
    });

    it("ignores dependents that could not be loaded", () => {
        const summary = summariseDependencies(task({
            dependents: [{ taskId: 9, dependsOnTaskId: 100, task: null }]
        }));

        expect(summary.blocking).toEqual([]);
        expect(summary.dependents).toEqual([]);
    });
});
