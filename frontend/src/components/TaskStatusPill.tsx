import type { Task } from "@knot/backend/tasks";
import { Tag } from "antd";

export const progressLabel = (progress: string) =>
    progress.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");

export const progressColor: Record<string, string> = {
    backlog: "default",
    in_progress: "blue",
    in_review: "purple",
    completed: "green"
};

export function TaskStatusPill(props: { task: Task }) {
    return <Tag color={progressColor[props.task.progress]}>{progressLabel(props.task.progress)}</Tag>
}