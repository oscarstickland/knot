import type {
    ActivityKind,
    AtRiskTask,
    BudgetLine,
    EventPhase,
    OverviewActivity,
    OverviewBudget,
    OverviewTasks
} from "../types/event-overview.ts";
import type { TaskAssignee } from "../types/tasks.ts";

export const AT_RISK_LIMIT = 5;
export const ACTIVITY_LIMIT = 8;
export const LATE_TITLE_LIMIT = 3;

export function getEventPhase(event: { start: Date; end: Date }, now: Date): EventPhase {
    if (now < event.start) return "upcoming";
    if (now <= event.end) return "live";
    return "past";
}

const roundMoney = (amount: number) => Math.round(amount * 100) / 100;

export type OverviewTaskInput = {
    id: number;
    title: string;
    progress: string;
    dueDate: Date | null;
    assignees: TaskAssignee[];
    prerequisiteIds: number[];
    // When the task was last moved to completed, if the audit log knows.
    completedAt: Date | null;
};

export function summariseTasks(tasks: OverviewTaskInput[], now: Date): OverviewTasks {
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const isDone = (task: OverviewTaskInput) => task.progress === "completed";
    const isOverdue = (task: OverviewTaskInput) => !isDone(task) && task.dueDate !== null && task.dueDate < now;

    // A prerequisite that no longer exists can't be waited on, so it is ignored.
    const unfinishedPrerequisites = (task: OverviewTaskInput) => task.prerequisiteIds
        .map((id) => byId.get(id))
        .filter((prerequisite): prerequisite is OverviewTaskInput => !!prerequisite && !isDone(prerequisite));

    const open = tasks.filter((task) => !isDone(task));
    const atRisk: AtRiskTask[] = open.flatMap((task) => {
        const waiting = unfinishedPrerequisites(task);
        const status = isOverdue(task)
            ? "overdue" as const
            : waiting.some(isOverdue) ? "blocked" as const : null;
        if (!status) return [];

        return [{
            id: task.id,
            title: task.title,
            assignees: task.assignees,
            dueDate: task.dueDate,
            status,
            waitingOn: waiting.map((prerequisite) => prerequisite.title)
        }];
    });

    // Overdue before blocked, then the earliest due date first.
    const sortedAtRisk = [...atRisk].sort((a, b) => {
        if (a.status !== b.status) return a.status === "overdue" ? -1 : 1;
        return (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity);
    });

    const completed = tasks.filter(isDone);
    // Without a recorded completion time (e.g. seeded data) a task gets the benefit of the doubt.
    const isLate = (task: OverviewTaskInput) => task.dueDate !== null && task.completedAt !== null && task.completedAt > task.dueDate;
    const late = completed.filter(isLate);

    return {
        total: tasks.length,
        completed: completed.length,
        overdue: open.filter(isOverdue).length,
        blocked: open.filter((task) => unfinishedPrerequisites(task).length > 0).length,
        atRiskCount: sortedAtRisk.length,
        atRisk: sortedAtRisk.slice(0, AT_RISK_LIMIT),
        completion: {
            onTime: completed.filter((task) => task.dueDate !== null && !isLate(task)).length,
            late: late.length,
            noDueDate: completed.filter((task) => task.dueDate === null).length,
            lateTitles: late.slice(0, LATE_TITLE_LIMIT).map((task) => task.title)
        }
    };
}

export type OverviewExpenseInput = {
    amount: number;
    categoryName: string;
    paidPersonally: boolean;
    reimbursedAt: Date | null;
};

export type OverviewIncomeInput = {
    amount: number;
    source: string;
};

function sumByLabel(entries: { label: string; amount: number }[]): BudgetLine[] {
    const totals = new Map<string, number>();
    for (const entry of entries) {
        totals.set(entry.label, (totals.get(entry.label) ?? 0) + entry.amount);
    }
    return [...totals.entries()]
        .map(([label, amount]) => ({ label, amount: roundMoney(amount) }))
        .sort((a, b) => b.amount - a.amount);
}

export function summariseBudget(input: {
    income: OverviewIncomeInput[];
    expenses: OverviewExpenseInput[];
    totalAllocated: number;
}): OverviewBudget {
    const totalIncome = roundMoney(input.income.reduce((sum, entry) => sum + entry.amount, 0));
    const totalSpent = roundMoney(input.expenses.reduce((sum, entry) => sum + entry.amount, 0));
    const owed = input.expenses.filter((expense) => expense.paidPersonally && !expense.reimbursedAt);

    return {
        totalIncome,
        totalSpent,
        totalAllocated: roundMoney(input.totalAllocated),
        net: roundMoney(totalIncome - totalSpent),
        totalOwed: roundMoney(owed.reduce((sum, expense) => sum + expense.amount, 0)),
        owedClaims: owed.length,
        incomeLines: sumByLabel(input.income.map((entry) => ({ label: entry.source, amount: entry.amount }))),
        expenseLines: sumByLabel(input.expenses.map((entry) => ({ label: entry.categoryName, amount: entry.amount })))
    };
}

export type RawAuditEntry = {
    id: number;
    action: "created" | "updated";
    changes: unknown;
    actorName: string | null;
    taskTitle: string;
    createdAt: Date;
};

// The audit log stores whatever was submitted, so work out what the entry means from its shape.
export function classifyAuditEntry(entry: Pick<RawAuditEntry, "action" | "changes">): { kind: ActivityKind; progress: string | null } {
    if (entry.action === "created") return { kind: "task_created", progress: null };

    const changes = typeof entry.changes === "object" && entry.changes !== null
        ? entry.changes as Record<string, unknown>
        : {};
    if (typeof changes.progress === "string") return { kind: "task_progress", progress: changes.progress };
    if (typeof changes.addedDocumentUrl === "string") return { kind: "task_link", progress: null };
    return { kind: "task_edited", progress: null };
}

export function auditEntryToActivity(entry: RawAuditEntry): OverviewActivity {
    const { kind, progress } = classifyAuditEntry(entry);
    return {
        key: `audit-${entry.id}`,
        kind,
        actorName: entry.actorName,
        subject: entry.taskTitle,
        amount: null,
        progress,
        at: entry.createdAt
    };
}

// Newest first; ties keep a stable order by key so the feed doesn't shuffle between loads.
export function mergeActivity(sources: OverviewActivity[][], limit: number = ACTIVITY_LIMIT): OverviewActivity[] {
    return sources
        .flat()
        .sort((a, b) => b.at.getTime() - a.at.getTime() || a.key.localeCompare(b.key))
        .slice(0, limit);
}
