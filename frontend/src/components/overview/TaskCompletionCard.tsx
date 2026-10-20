import { Button, Card, Progress, Typography, theme } from "antd";
import type { OverviewTasks } from "@knot/backend/event-overview";

const { Text } = Typography;

function Bar({ label, count, total, colour }: { label: string; count: number; total: number; colour: string }) {
    return <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
            <Text>{label}</Text>
            <Text type="secondary">{count} of {total}</Text>
        </div>
        <Progress
            percent={total === 0 ? 0 : Math.round((count / total) * 100)}
            showInfo={false}
            size="small"
            strokeColor={colour}
            aria-label={`${label}: ${count} of ${total}`}
        />
    </div>
}

export function TaskCompletionCard({ tasks, onOpenTasks }: { tasks: OverviewTasks; onOpenTasks: () => void }) {
    const { token } = theme.useToken();
    const { onTime, late, noDueDate, lateTitles } = tasks.completion;
    const lateList = lateTitles.length > 1
        ? `${lateTitles.slice(0, -1).join(", ")} and ${lateTitles[lateTitles.length - 1]}`
        : lateTitles[0];

    return <Card
        title="Tasks"
        extra={<Button type="link" size="small" onClick={onOpenTasks}>View all</Button>}
    >
        <Bar label="Completed on time" count={onTime} total={tasks.total} colour={token.colorSuccess} />
        <Bar label="Completed late" count={late} total={tasks.total} colour={token.colorWarning} />
        {noDueDate > 0 && <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
            {noDueDate} completed without a due date.
        </Text>}
        {late > 0 && <Text type="secondary">
            {lateList} {lateTitles.length === 1 ? "was" : "were"} finished after the due date
            {late > lateTitles.length ? ` (and ${late - lateTitles.length} more)` : ""}. Worth starting earlier next time.
        </Text>}
    </Card>
}
