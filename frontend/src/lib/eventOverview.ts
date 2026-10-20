import type { OverviewActivity, OverviewTasks } from "@knot/backend/event-overview";
import { formatCurrency } from "./currency.ts";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// Kept local so this file stays free of UI imports and cheap to unit test.
const progressLabel = (progress: string) =>
    progress.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");

const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? "" : "s"}`;

// The big number on the "Starts in" tile: the largest whole unit that still reads naturally.
export function describeCountdown(start: Date | string, now: Date): string {
    const remaining = new Date(start).getTime() - now.getTime();
    if (remaining <= 0) return "Starting now";
    if (remaining >= DAY_MS) return plural(Math.floor(remaining / DAY_MS), "day");
    if (remaining >= HOUR_MS) return plural(Math.floor(remaining / HOUR_MS), "hour");
    return plural(Math.max(1, Math.floor(remaining / MINUTE_MS)), "minute");
}

// Whole days past the due date, or null when the date hasn't passed yet.
export function daysOverdue(dueDate: Date | string, now: Date): number | null {
    const elapsed = now.getTime() - new Date(dueDate).getTime();
    return elapsed > 0 ? Math.floor(elapsed / DAY_MS) : null;
}

export function describeOverdue(dueDate: Date | string, now: Date): string {
    const days = daysOverdue(dueDate, now);
    if (days === null) return "";
    return days === 0 ? "overdue today" : `${plural(days, "day")} overdue`;
}

// "2 blocked, 1 overdue", or a reassuring fallback when nothing is wrong.
export function describeTaskHealth(tasks: Pick<OverviewTasks, "blocked" | "overdue" | "total" | "completed">): string {
    const parts = [
        tasks.blocked > 0 ? `${tasks.blocked} blocked` : null,
        tasks.overdue > 0 ? `${tasks.overdue} overdue` : null
    ].filter((part): part is string => part !== null);

    if (parts.length > 0) return parts.join(", ");
    if (tasks.total === 0) return "no tasks yet";
    return tasks.completed === tasks.total ? "everything is done" : "all on track";
}

export function describeLateTasks(tasks: Pick<OverviewTasks, "completed" | "total" | "completion">): string {
    const { late } = tasks.completion;
    if (late > 0) return `${late} finished after the due date`;
    if (tasks.completed < tasks.total) return `${tasks.total - tasks.completed} still open`;
    return "all finished on time";
}

// Share of the expected crowd that turned up, or null when no target was set.
export function turnoutPercent(checkedIn: number, expected: number | null): number | null {
    if (!expected) return null;
    return Math.round((checkedIn / expected) * 100);
}

export function formatSignedCurrency(amount: number): string {
    return amount > 0 ? `+${formatCurrency(amount)}` : formatCurrency(amount);
}

export function initials(name: string | null): string {
    if (!name) return "?";
    const letters = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word.charAt(0).toUpperCase());
    return letters.join("") || "?";
}

export type ActivitySentence = {
    // Reads straight after the person's name, e.g. "ticked off".
    action: string;
    // The thing acted on, shown emphasised. Empty when the sentence has none.
    subject: string;
    suffix: string;
};

export function describeActivity(item: Pick<OverviewActivity, "kind" | "subject" | "amount" | "progress">): ActivitySentence {
    const { subject } = item;
    const money = item.amount === null ? "" : formatCurrency(item.amount);

    switch (item.kind) {
        case "task_created": return { action: "created", subject, suffix: "" };
        case "task_progress":
            return item.progress === "completed"
                ? { action: "ticked off", subject, suffix: "" }
                : { action: "moved", subject, suffix: item.progress ? `to ${progressLabel(item.progress)}` : "" };
        case "task_edited": return { action: "edited", subject, suffix: "" };
        case "task_link": return { action: "added a link to", subject, suffix: "" };
        case "comment": return { action: "commented on", subject, suffix: "" };
        case "expense": return { action: `added a ${money} expense for`, subject, suffix: "" };
        case "income": return { action: `recorded ${money} of income from`, subject, suffix: "" };
        case "document": return { action: "added the document", subject, suffix: "" };
    }
}
