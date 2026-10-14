import type { Task } from "@knot/backend/tasks";
import { Tag } from "antd";
import { CheckCircleFilled } from "@ant-design/icons";

export const progressLabel = (progress: string) =>
    progress.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");

export const progressColor: Record<string, string> = {
    backlog: "default",
    in_progress: "blue",
    in_review: "purple",
    completed: "green"
};

export const priorityColor: Record<string, string> = {
    low: "default",
    medium: "gold",
    high: "red"
};

export function TaskStatusPill(props: { task: Task }) {
    return <ProgressTag progress={props.task.progress} />
}

export function ProgressTag(props: { progress: string }) {
    return <Tag
        color={progressColor[props.progress]}
        icon={props.progress === "completed" ? <CheckCircleFilled /> : undefined}
    >
        {progressLabel(props.progress)}
    </Tag>
}