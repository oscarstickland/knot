import { Button, Card, ConfigProvider, Empty, Table, Tag, Typography, theme, type TableProps } from "antd";
import dayjs from "dayjs";
import type { AtRiskTask } from "@knot/backend/event-overview";
import { describeOverdue } from "@/lib/eventOverview.ts";

const { Text } = Typography;

interface AtRiskCardProps {
    tasks: AtRiskTask[];
    totalCount: number;
    now: Date;
    onOpenTasks: () => void;
}

export function AtRiskCard({ tasks, totalCount, now, onOpenTasks }: AtRiskCardProps) {
    const { token } = theme.useToken();

    const columns: TableProps<AtRiskTask>["columns"] = [
        {
            key: "task",
            title: "Task",
            render: (_, task) => <>
                <Text strong>{task.title}</Text>
                <br />
                <Text style={{ color: task.status === "overdue" ? token.colorError : token.colorWarning, fontSize: token.fontSizeSM }}>
                    {task.status === "overdue" && task.dueDate
                        ? describeOverdue(task.dueDate, now)
                        : `waiting on ${task.waitingOn.join(", ")}`}
                </Text>
            </>
        },
        {
            key: "assignee",
            title: "Assignee",
            render: (_, task) => task.assignees.length > 0
                ? task.assignees.map((assignee) => assignee.name).join(", ")
                : <Text type="secondary">Unassigned</Text>
        },
        {
            key: "due",
            title: "Due",
            render: (_, task) => task.dueDate ? dayjs(task.dueDate).format("D MMM") : "—"
        },
        {
            key: "status",
            title: "Status",
            render: (_, task) => task.status === "overdue"
                ? <Tag color="red">Overdue</Tag>
                : <Tag color="gold">Blocked</Tag>
        }
    ];

    return <Card
        title="At risk"
        extra={<Button type="link" size="small" onClick={onOpenTasks}>
            {totalCount > tasks.length ? `All ${totalCount} at risk` : "All tasks"}
        </Button>}
        styles={{ body: { padding: 0 } }}
    >
        <ConfigProvider theme={{ components: { Table: { headerBorderRadius: 0, cellPaddingInlineMD: token.paddingLG, cellPaddingBlockMD: token.paddingSM } } }}>
            <Table
                rowKey="id"
                size="middle"
                dataSource={tasks}
                columns={columns}
                pagination={false}
                scroll={{ x: true }}
                onRow={() => ({
                    onClick: onOpenTasks,
                    style: { cursor: "pointer" }
                })}
                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing at risk. Every open task is on track." /> }}
            />
        </ConfigProvider>
    </Card>
}
