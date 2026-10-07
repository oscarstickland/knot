export type DependencyEdge = {
    taskId: number;
    dependsOnTaskId: number;
};

// Returns the first proposed dependency that would introduce a cycle if `taskId`
// were updated to depend on `dependencyIds`, or null if the change is safe.
// The task's own existing edges are ignored, as they are replaced by the update.
export function findCyclicDependency(
    existingDependencies: DependencyEdge[],
    taskId: number,
    dependencyIds: number[]
): number | null {
    const adjacency = new Map<number, number[]>();
    for (const dependency of existingDependencies) {
        if (dependency.taskId === taskId) continue;
        const existing = adjacency.get(dependency.taskId) ?? [];
        adjacency.set(dependency.taskId, [...existing, dependency.dependsOnTaskId]);
    }

    function canReach(from: number, target: number, visited: Set<number>): boolean {
        if (from === target) return true;
        if (visited.has(from)) return false;
        visited.add(from);
        return (adjacency.get(from) ?? []).some((next) => canReach(next, target, visited));
    }

    return dependencyIds.find((dependencyId) => canReach(dependencyId, taskId, new Set())) ?? null;
}
