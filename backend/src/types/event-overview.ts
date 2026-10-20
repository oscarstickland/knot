import type { TaskAssignee } from "./tasks.ts";

// upcoming: not started yet, live: between start and end, past: finished
export type EventPhase = "upcoming" | "live" | "past";

// "overdue" means the task itself is past its due date. "blocked" means it is waiting on a
// prerequisite that is itself overdue.
export type AtRiskStatus = "overdue" | "blocked";

export type AtRiskTask = {
    id: number;
    title: string;
    assignees: TaskAssignee[];
    dueDate: Date | null;
    status: AtRiskStatus;
    // Titles of the unfinished prerequisites holding this task up.
    waitingOn: string[];
};

export type OverviewTaskCompletion = {
    onTime: number;
    late: number;
    // Completed tasks that never had a due date, so can't be judged either way.
    noDueDate: number;
    lateTitles: string[];
};

export type OverviewTasks = {
    total: number;
    completed: number;
    overdue: number;
    // Unfinished tasks that still have an unfinished prerequisite.
    blocked: number;
    atRiskCount: number;
    atRisk: AtRiskTask[];
    completion: OverviewTaskCompletion;
};

export type OverviewAttendance = {
    checkedIn: number;
    expected: number | null;
    firstCheckIn: Date | null;
    lastCheckIn: Date | null;
};

export type OverviewDocument = {
    id: number;
    title: string;
    url: string;
    addedBy: string;
    createdAt: Date;
};

export type OverviewDocuments = {
    total: number;
    recent: OverviewDocument[];
};

export type BudgetLine = {
    label: string;
    amount: number;
};

// Only built for execs and admins, as standard members never see club-wide money.
export type OverviewBudget = {
    totalIncome: number;
    totalSpent: number;
    totalAllocated: number;
    // Income minus spending; positive means surplus.
    net: number;
    // Personally paid expenses not yet reimbursed, and how many claims that is.
    totalOwed: number;
    owedClaims: number;
    incomeLines: BudgetLine[];
    expenseLines: BudgetLine[];
};

export type ActivityKind =
    | "task_created"
    | "task_progress"
    | "task_edited"
    | "task_link"
    | "comment"
    | "expense"
    | "income"
    | "document";

export type OverviewActivity = {
    key: string;
    kind: ActivityKind;
    actorName: string | null;
    // The thing acted on: task title, expense category, income source or document title.
    subject: string;
    amount: number | null;
    // Only set for task_progress.
    progress: string | null;
    at: Date;
};

export type EventOverview = {
    phase: EventPhase;
    tasks: OverviewTasks;
    attendance: OverviewAttendance;
    documents: OverviewDocuments;
    activity: OverviewActivity[];
    // Null for standard members.
    budget: OverviewBudget | null;
};
