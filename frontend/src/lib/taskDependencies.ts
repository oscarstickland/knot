import { findCyclicDependency, type DependencyEdge } from "@knot/backend/task-dependencies";
import type { TaskWithRelations } from "@knot/backend/tasks";

export type DependencyOption = {
    label: string;
    value: number;
    disabled: boolean;
};

// Builds the dependency picker options for a task. Tasks that already depend on
// this one (directly or transitively) are disabled to prevent cycles.
export function buildDependencyOptions(
    eventTasks: { id: number; title: string; dependsOn: DependencyEdge[] }[],
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

export type LinkedTask = {
    id: number;
    title: string;
    isComplete: boolean;
};

export type DependencySummary = {
    // Every task this one depends on, complete or not.
    prerequisites: LinkedTask[];
    // Prerequisites still to be completed before this task can be.
    waitingOn: LinkedTask[];
    // Every task that depends on this one, complete or not.
    dependents: LinkedTask[];
    // Incomplete tasks that cannot be completed until this one is.
    blocking: LinkedTask[];
};

export type DependencySummaryInput = Pick<TaskWithRelations, "progress" | "dependsOn" | "dependents">;

export function summariseDependencies(task: DependencySummaryInput): DependencySummary {
    const isTaskComplete = task.progress === "completed";

    // A prerequisite that failed to load is treated as incomplete, as the server
    // will refuse to complete this task until it can confirm otherwise.
    const prerequisites = task.dependsOn.map((dependency) => ({
        id: dependency.dependsOnTaskId,
        title: dependency.dependsOnTask?.title ?? `Task ${dependency.dependsOnTaskId}`,
        isComplete: dependency.dependsOnTask?.progress === "completed"
    }));

    const dependents = task.dependents.flatMap((dependent) => dependent.task
        ? [{ id: dependent.task.id, title: dependent.task.title, isComplete: dependent.task.progress === "completed" }]
        : []);

    return {
        prerequisites,
        waitingOn: isTaskComplete ? [] : prerequisites.filter((linked) => !linked.isComplete),
        dependents,
        blocking: isTaskComplete ? [] : dependents.filter((linked) => !linked.isComplete)
    };
}
