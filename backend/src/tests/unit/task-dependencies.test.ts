import { describe, it, expect } from "bun:test";
import { findCyclicDependency, type DependencyEdge } from "../../services/task-dependencies.ts";

describe("findCyclicDependency", () => {
    it("returns null when there are no proposed dependencies", () => {
        const edges: DependencyEdge[] = [{ taskId: 2, dependsOnTaskId: 1 }];
        expect(findCyclicDependency(edges, 1, [])).toBeNull();
    });

    it("returns null when there are no existing dependencies", () => {
        expect(findCyclicDependency([], 1, [2, 3])).toBeNull();
    });

    it("detects a task depending on itself", () => {
        expect(findCyclicDependency([], 1, [1])).toBe(1);
    });

    it("detects a direct cycle between two tasks", () => {
        // 2 -> 1, so 1 -> 2 would close the loop
        const edges: DependencyEdge[] = [{ taskId: 2, dependsOnTaskId: 1 }];
        expect(findCyclicDependency(edges, 1, [2])).toBe(2);
    });

    it("detects a transitive cycle across a chain of tasks", () => {
        // 4 -> 3 -> 2 -> 1, so 1 -> 4 would close the loop
        const edges: DependencyEdge[] = [
            { taskId: 2, dependsOnTaskId: 1 },
            { taskId: 3, dependsOnTaskId: 2 },
            { taskId: 4, dependsOnTaskId: 3 }
        ];
        expect(findCyclicDependency(edges, 1, [4])).toBe(4);
    });

    it("returns the offending dependency when only one of several proposed dependencies is cyclic", () => {
        const edges: DependencyEdge[] = [
            { taskId: 3, dependsOnTaskId: 1 },
            { taskId: 4, dependsOnTaskId: 2 }
        ];
        expect(findCyclicDependency(edges, 1, [4, 3])).toBe(3);
    });

    it("allows diamond-shaped dependencies that share a common ancestor", () => {
        // 2 -> 1, 3 -> 1, so 4 -> [2, 3] is acyclic
        const edges: DependencyEdge[] = [
            { taskId: 2, dependsOnTaskId: 1 },
            { taskId: 3, dependsOnTaskId: 1 }
        ];
        expect(findCyclicDependency(edges, 4, [2, 3])).toBeNull();
    });

    it("allows depending on a task further down the same chain", () => {
        // 3 -> 2 -> 1, so 3 -> 1 directly is still acyclic
        const edges: DependencyEdge[] = [
            { taskId: 2, dependsOnTaskId: 1 },
            { taskId: 3, dependsOnTaskId: 2 }
        ];
        expect(findCyclicDependency(edges, 3, [1, 2])).toBeNull();
    });

    it("ignores the task's own existing dependencies as they are being replaced", () => {
        // 1 -> 2 currently, 2 has no dependencies; re-saving 1 -> 2 is fine
        const edges: DependencyEdge[] = [{ taskId: 1, dependsOnTaskId: 2 }];
        expect(findCyclicDependency(edges, 1, [2])).toBeNull();
    });

    it("terminates on pre-existing cycles elsewhere in the graph", () => {
        // 2 <-> 3 already loop (should never happen, but must not hang)
        const edges: DependencyEdge[] = [
            { taskId: 2, dependsOnTaskId: 3 },
            { taskId: 3, dependsOnTaskId: 2 }
        ];
        expect(findCyclicDependency(edges, 1, [2])).toBeNull();
    });
});
