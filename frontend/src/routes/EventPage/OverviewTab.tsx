import { useMemo } from "react";
import { Alert, Col, Row, Skeleton } from "antd";
import useSWR from "swr";
import type { AxiosError } from "axios";
import dayjs from "dayjs";
import type { ClubEvent } from "@knot/backend/events";
import type { EventOverview } from "@knot/backend/event-overview";
import { useUser } from "@/lib/auth.tsx";
import { formatCurrency } from "@/lib/currency.ts";
import {
    describeCountdown,
    describeLateTasks,
    describeTaskHealth,
    formatSignedCurrency,
    turnoutPercent
} from "@/lib/eventOverview.ts";
import { EventModal } from "@/components/EventModal.tsx";
import { StatTile, type StatTone } from "@/components/overview/StatTile.tsx";
import { AtRiskCard } from "@/components/overview/AtRiskCard.tsx";
import { ActivityCard } from "@/components/overview/ActivityCard.tsx";
import { EventDetailsCard } from "@/components/overview/EventDetailsCard.tsx";
import { OverviewDocumentsCard } from "@/components/overview/OverviewDocumentsCard.tsx";
import { AttendanceCard } from "@/components/overview/AttendanceCard.tsx";
import { FinancialsCard } from "@/components/overview/FinancialsCard.tsx";
import { TaskCompletionCard } from "@/components/overview/TaskCompletionCard.tsx";

const REFRESH_INTERVAL_MS = 30_000;

interface OverviewTabProps {
    event: ClubEvent;
    active: boolean;
    onNavigate: (tab: "tasks" | "budget" | "attendance" | "documents") => void;
}

type Stat = { key: string; label: string; value: string; caption: string; tone?: StatTone };

function buildStats(event: ClubEvent, overview: EventOverview, now: Date): Stat[] {
    const { tasks, budget, attendance } = overview;
    const taskStat: Stat = {
        key: "tasks",
        label: overview.phase === "upcoming" ? "Tasks" : "Tasks completed",
        value: `${tasks.completed} / ${tasks.total}`,
        caption: overview.phase === "upcoming" ? describeTaskHealth(tasks) : describeLateTasks(tasks),
        tone: overview.phase === "upcoming" && tasks.overdue > 0 ? "warning" : "default"
    };
    const netStat: Stat[] = budget ? [{
        key: "net",
        label: "Net position",
        value: formatSignedCurrency(budget.net),
        caption: `${formatCurrency(budget.totalIncome)} in, ${formatCurrency(budget.totalSpent)} out`,
        tone: budget.net < 0 ? "negative" : budget.net > 0 ? "positive" : "default"
    }] : [];

    if (overview.phase === "upcoming") {
        return [
            { key: "countdown", label: "Starts in", value: describeCountdown(event.start, now), caption: dayjs(event.start).format("ddd D MMM, h:mma") },
            taskStat,
            ...netStat,
            {
                key: "expected",
                label: "Expected attendees",
                value: event.expectedAttendees ? String(event.expectedAttendees) : "—",
                caption: event.expectedAttendees ? (event.attendanceOpen ? "check-in is open" : "check-in opens on the day") : "no target set"
            }
        ];
    }

    const turnout = turnoutPercent(attendance.checkedIn, attendance.expected);
    return [
        {
            key: "attendance",
            label: "Attendance",
            value: attendance.expected ? `${attendance.checkedIn} / ${attendance.expected}` : String(attendance.checkedIn),
            caption: turnout === null ? "checked in" : `${turnout}% turnout`
        },
        ...netStat,
        taskStat,
        ...(budget ? [{
            key: "owed",
            label: "Still owed to members",
            value: formatCurrency(budget.totalOwed),
            caption: budget.owedClaims > 0 ? `${budget.owedClaims} unreimbursed ${budget.owedClaims === 1 ? "claim" : "claims"}` : "all claims settled",
            tone: budget.totalOwed > 0 ? "warning" as const : "positive" as const
        }] : [])
    ];
}

export function OverviewTab({ event, active, onNavigate }: OverviewTabProps) {
    const user = useUser();
    const isEventManager = user.role === "admin" || user.role === "exec";
    const { data, error, isLoading } = useSWR<EventOverview, AxiosError>(`/events/${event.id}/overview`, {
        refreshInterval: active ? REFRESH_INTERVAL_MS : 0
    });
    // Recomputed whenever fresh data arrives so countdowns and overdue labels stay current.
    const now = useMemo(() => new Date(), [data]);

    if (error) return <Alert type="error" showIcon title="Unable to load the overview." />
    if (isLoading || !data) return <Skeleton active paragraph={{ rows: 8 }} />

    const stats = buildStats(event, data, now);
    const statSpan = 24 / stats.length;
    const hasEnded = data.phase !== "upcoming";

    const detailsCard = <EventDetailsCard
        event={event}
        extra={isEventManager && !event.archived ? <EventModal event={event} mode="update" /> : undefined}
    />;
    const documentsCard = <OverviewDocumentsCard documents={data.documents} onOpenDocuments={() => onNavigate("documents")} />;

    return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Row gutter={[16, 16]}>
            {stats.map((stat) => <Col key={stat.key} xs={24} sm={12} lg={statSpan}>
                <StatTile label={stat.label} value={stat.value} caption={stat.caption} tone={stat.tone} />
            </Col>)}
        </Row>

        <Row gutter={[16, 16]}>
            <Col xs={24} lg={16}>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {hasEnded
                        ? <>
                            <AttendanceCard attendance={data.attendance} onOpenAttendance={() => onNavigate("attendance")} />
                            {data.budget && <FinancialsCard budget={data.budget} onOpenBudget={() => onNavigate("budget")} />}
                            {data.tasks.atRiskCount > 0 && <AtRiskCard tasks={data.tasks.atRisk} totalCount={data.tasks.atRiskCount} now={now} onOpenTasks={() => onNavigate("tasks")} />}
                            <ActivityCard activity={data.activity} />
                        </>
                        : <>
                            <AtRiskCard tasks={data.tasks.atRisk} totalCount={data.tasks.atRiskCount} now={now} onOpenTasks={() => onNavigate("tasks")} />
                            <ActivityCard activity={data.activity} />
                        </>
                    }
                </div>
            </Col>
            <Col xs={24} lg={8}>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {hasEnded
                        ? <>
                            <TaskCompletionCard tasks={data.tasks} onOpenTasks={() => onNavigate("tasks")} />
                            {documentsCard}
                            {detailsCard}
                        </>
                        : <>
                            {detailsCard}
                            {documentsCard}
                        </>
                    }
                </div>
            </Col>
        </Row>
    </div>
}
