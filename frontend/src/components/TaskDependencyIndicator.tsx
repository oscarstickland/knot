import type { ReactNode } from "react";
import { Popover, Space, Tag, Typography, theme } from "antd";
import { CheckCircleOutlined, ClockCircleOutlined, LockOutlined, PartitionOutlined } from "@ant-design/icons";
import { summariseDependencies, type DependencySummaryInput, type LinkedTask } from "@/lib/taskDependencies.ts";
import { pluralise } from "@/lib/pluralise.ts";

const { Text } = Typography;

// Compact dependency state for a task row: what it is waiting on, whether it is
// clear to finish, and what is waiting on it. Renders `fallback` for unlinked tasks.
export function TaskDependencyIndicator(props: { task: DependencySummaryInput; fallback?: ReactNode }) {
    const { prerequisites, waitingOn, blocking } = summariseDependencies(props.task);
    const isUnblocked = prerequisites.length > 0 && waitingOn.length === 0 && props.task.progress !== "completed";

    if (waitingOn.length === 0 && blocking.length === 0 && !isUnblocked) return <>{props.fallback ?? null}</>;

    return <Space size={[4, 4]} wrap>
        {waitingOn.length > 0 &&
            <LinkedTasksPopover heading="Finish these first" tasks={prerequisites}>
                <Tag
                    color="orange"
                    icon={<LockOutlined />}
                    tabIndex={0}
                    aria-label={`Waiting on ${waitingOn.map((linked) => linked.title).join(", ")}`}
                >
                    Waiting on {pluralise(waitingOn.length, "task")}
                </Tag>
            </LinkedTasksPopover>
        }
        {isUnblocked &&
            <LinkedTasksPopover heading="Prerequisites done" tasks={prerequisites}>
                <Tag color="green" icon={<CheckCircleOutlined />} tabIndex={0}>Unblocked</Tag>
            </LinkedTasksPopover>
        }
        {blocking.length > 0 &&
            <LinkedTasksPopover heading="Waiting on this task" tasks={blocking}>
                <Tag
                    icon={<PartitionOutlined />}
                    tabIndex={0}
                    aria-label={`Blocking ${blocking.map((linked) => linked.title).join(", ")}`}
                >
                    Blocking {pluralise(blocking.length, "task")}
                </Tag>
            </LinkedTasksPopover>
        }
    </Space>
}

// One tag per linked task, marked done or outstanding by icon as well as colour.
export function LinkedTaskTags(props: { tasks: LinkedTask[]; emptyText: string }) {
    if (props.tasks.length === 0) return <Text type="secondary">{props.emptyText}</Text>;

    return <Space size={[4, 4]} wrap>
        {props.tasks.map((linked) => (
            <Tag
                key={linked.id}
                color={linked.isComplete ? "green" : "default"}
                icon={linked.isComplete ? <CheckCircleOutlined /> : <ClockCircleOutlined />}
            >
                {linked.title}
            </Tag>
        ))}
    </Space>
}

function LinkedTasksPopover(props: { heading: string; tasks: LinkedTask[]; children: ReactNode }) {
    return <Popover
        trigger={["hover", "focus"]}
        title={props.heading}
        content={<LinkedTaskList tasks={props.tasks} />}
    >
        {props.children}
    </Popover>
}

function LinkedTaskList(props: { tasks: LinkedTask[] }) {
    const { token } = theme.useToken();

    return <ul style={{ listStyle: "none", margin: 0, padding: 0, maxWidth: "280px" }}>
        {props.tasks.map((linked) => (
            <li key={linked.id} style={{ display: "flex", gap: token.marginXS, padding: `${token.paddingXXS}px 0` }}>
                {linked.isComplete
                    ? <CheckCircleOutlined style={{ color: token.colorSuccess, marginTop: "4px" }} aria-label="Done" />
                    : <ClockCircleOutlined style={{ color: token.colorTextTertiary, marginTop: "4px" }} aria-label="Not done" />}
                <Text delete={linked.isComplete} type={linked.isComplete ? "secondary" : undefined}>{linked.title}</Text>
            </li>
        ))}
    </ul>
}
