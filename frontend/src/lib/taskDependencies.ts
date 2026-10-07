import { findCyclicDependency } from "@knot/backend/task-dependencies";
import type { TaskWithRelations } from "@knot/backend/tasks";

export type DependencyOption = {
    label: string;
    value: number;
    disabled: boolean;
};

// Builds the dependency picker options for a task. Tasks that already depend on
// this one (directly or transitively) are disabled to prevent cycles.
export function buildDependencyOptions(
    eventTasks: Pick<TaskWithRelations, "id" | "title" | "dependsOn">[],
    taskId: number | undefined
): DependencyOption[] {
    const existingDependencies = eventTasks.flatMap((candidate) => candidate.dependsOn);

    return eventTasks
        .filter((candidate) => candidate.id !== taskId)
        .map((candidate) => ({
            label: candidate.title,
            value: candidate.id,
            disabled: taskId !== undefined && findCyclicDependency(existingDependencies, taskId, [candidate.id]) !== null
        }));
}
