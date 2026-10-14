import type { CSSProperties } from "react";

export const isTaskCompleted = (task: { progress: string }) => task.progress === "completed";

// Tints a completed task row and adds a success accent on its first cell so
// finished tasks stand out at a glance. Takes antd tokens so it follows the theme.
export function completedRowStyle(
    task: { progress: string },
    tokens: { colorSuccessBg: string; colorSuccess: string }
): { row: CSSProperties; firstCell: CSSProperties } {
    if (!isTaskCompleted(task)) {
        return { row: {}, firstCell: {} };
    }

    return {
        row: { background: tokens.colorSuccessBg },
        firstCell: { borderLeft: `3px solid ${tokens.colorSuccess}` }
    };
}
