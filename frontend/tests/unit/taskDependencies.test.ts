import { describe, it, expect } from "bun:test";
import { buildDependencyOptions } from "../../src/lib/taskDependencies.ts";

type TestTask = Parameters<typeof buildDependencyOptions>[0][number];

function task(id: number, dependsOnIds: number[] = []): TestTask {
    return {
        id,
        title: `Task ${id}`,
        dependsOn: dependsOnIds.map((dependsOnTaskId) => ({ taskId: id, dependsOnTaskId }))
    };
}

describe("buildDependencyOptions", () => {
    it("offers every event task with nothing disabled when creating a task", () => {
        const options = buildDependencyOptions([task(1), task(2, [1])], undefined);

        expect(options).toEqual([
            { label: "Task 1", value: 1, disabled: false },
            { label: "Task 2", value: 2, disabled: false }
        ]);
    });

    it("excludes the task being edited from its own options", () => {
        const options = buildDependencyOptions([task(1), task(2)], 1);

        expect(options.map((option) => option.value)).toEqual([2]);
    });

    it("disables a task that directly depends on the task being edited", () => {
        const options = buildDependencyOptions([task(1), task(2, [1]), task(3)], 1);

        expect(options).toEqual([
            { label: "Task 2", value: 2, disabled: true },
            { label: "Task 3", value: 3, disabled: false }
        ]);
    });

    it("disables a task that transitively depends on the task being edited", () => {
        // 3 -> 2 -> 1
        const options = buildDependencyOptions([task(1), task(2, [1]), task(3, [2])], 1);

        expect(options.filter((option) => option.disabled).map((option) => option.value)).toEqual([2, 3]);
    });

    it("keeps the task's current dependencies selectable", () => {
        // 2 -> 1, editing 2: depending on 1 is still valid
        const options = buildDependencyOptions([task(1), task(2, [1])], 2);

        expect(options).toEqual([{ label: "Task 1", value: 1, disabled: false }]);
    });

    it("returns no options when the event has no other tasks", () => {
        expect(buildDependencyOptions([], undefined)).toEqual([]);
        expect(buildDependencyOptions([task(1)], 1)).toEqual([]);
    });
});
