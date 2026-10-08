import { useState } from "react";
import {
    Avatar,
    Checkbox,
    Empty,
    Result,
    Select,
    Table,
    Tag,
    Tooltip,
    Typography,
    theme,
    type TableProps
} from "antd";
import useSWR, { mutate } from "swr";
import { taskProgressStates, type TaskWithRelations } from "@knot/backend/tasks";
import { AxiosInstance } from "@/lib/fetcher.tsx";
import { useUser } from "@/lib/auth.tsx";
import { TaskDrawer } from "@/components/TaskDrawer.tsx";
import dayjs from "dayjs";
import { UserOutlined } from "@ant-design/icons";
import { priorityColor, progressColor, progressLabel } from "@/components/TaskStatusPill.tsx";
import { useAppNotification } from "@/lib/useAppNotification";
import { summariseDependencies } from "@/lib/taskDependencies.ts";
import { LinkedTaskTags } from "@/components/TaskDependencyIndicator.tsx";

const { Text } = Typography;

// Completion is locked while prerequisites are outstanding, mirroring the server rule.
const progressOptions = (isWaiting: boolean) => taskProgressStates.map((progress) => ({
    label: progressLabel(progress),
    value: progress,
    disabled: isWaiting && progress === "completed"
}));

function waitingOnMessage(task: TaskWithRelations): string | null {
    const { waitingOn } = summariseDependencies(task);
    if (waitingOn.length === 0) return null;
    return `Finish ${waitingOn.map((linked) => linked.title).join(", ")} before completing this task`;
}

export function TasksSection(props: { eventId: number }) {
    const { token } = theme.useToken();
    const user = useUser();
    const isTaskManager = user.role === "admin" || user.role === "exec";
    const { data: tasks, isLoading, error } = useSWR<TaskWithRelations[]>(`/tasks?eventId=${props.eventId}`);
    const [openTaskId, setOpenTaskId] = useState<number | null>(null);

    if (error) {
        return <Result status="error" title="Retrieval Error" subTitle="Something went wrong loading tasks for this event. Try refreshing the page." />
    }

    return <div>
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: "16px"
        }}>
            { isTaskManager ? <TaskDrawer mode="create" eventId={props.eventId} /> : "" }
        </div>

        <Table
            rowKey="id"
            size="small"
            loading={isLoading}
            dataSource={tasks ?? []}
            pagination={false}
            scroll={{ x: "max-content" }}
            locale={{ emptyText: <Empty description="No tasks yet" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
            onRow={(task) => ({
                onClick: () => setOpenTaskId(task.id),
                style: { cursor: "pointer" }
            })}
            columns={[
                {
                    key: "complete",
                    width: 36,
                    render: (_, task) => (
                        <div onClick={(e) => e.stopPropagation()}>
                            <CompleteCheckbox task={task} eventId={props.eventId} isTaskManager={isTaskManager} />
                        </div>
                    )
                },
                {
                    key: "title",
                    title: "Task",
                    dataIndex: "title",
                    render: (title, task) => <div>
                        <Text strong delete={task.progress === "completed"}>{title}</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: "12px" }}>{task.description}</Text>
                    </div>
                },
                {
                    key: "priority",
                    title: "Priority",
                    dataIndex: "priority",
                    width: 110,
                    responsive: ["sm"],
                    render: (priority) => <Tag color={priorityColor[priority]}>{priority.toUpperCase()}</Tag>
                },
                {
                    key: "progress",
                    title: "Progress",
                    dataIndex: "progress",
                    width: 170,
                    render: (_, task) => (
                        <div onClick={(e) => e.stopPropagation()}>
                            <ProgressSelect task={task} eventId={props.eventId} isTaskManager={isTaskManager} />
                        </div>
                    )
                },
                {
                    key: "dependsOn",
                    title: "Depends On",
                    width: 160,
                    responsive: ["xl"],
                    render: (_, task) => <LinkedTaskTags tasks={summariseDependencies(task).prerequisites} emptyText="—" />
                },
                {
                    key: "assignees",
                    title: "Assignees",
                    width: 130,
                    responsive: ["lg"],
                    render: (_, task) => (
                        <Avatar.Group max={{ count: 3 }}>
                            {task.assignments.map((assignment) => (
                                <Tooltip key={assignment.userId} title={assignment.user?.name ?? `User ${assignment.userId}`}>
                                    <Avatar size="small" icon={<UserOutlined />} />
                                </Tooltip>
                            ))}
                        </Avatar.Group>
                    )
                },
                {
                    key: "dueDate",
                    title: "Due",
                    width: 150,
                    responsive: ["md"],
                    render: (_, task) => task.dueDate
                        ? <Text style={{ color: token.colorTextSecondary }}>{dayjs(task.dueDate).format("D MMM YYYY")}</Text>
                        : <Text type="secondary">—</Text>
                }
            ] as TableProps<TaskWithRelations>['columns']}
        />

        {(tasks ?? []).map((task) => (
            <TaskDrawer
                key={task.id}
                mode="update"
                eventId={props.eventId}
                task={task}
                isTaskManager={isTaskManager}
                open={openTaskId === task.id}
                onOpenChange={(value) => setOpenTaskId(value ? task.id : null)}
            />
        ))}
    </div>
}

function useTaskProgress(task: TaskWithRelations, eventId: number) {
    const user = useUser();
    const [api, contextHolder] = useAppNotification();
    const isAssigned = task.assignments.some((assignment) => assignment.userId === user.id);

    const updateProgress = (progress: string) => {
        AxiosInstance.patch(`/tasks/${task.id}/progress`, { progress })
            .then(async () => {
                await mutate(`/tasks?eventId=${eventId}`);
            })
            .catch((err) => {
                const message = err?.response?.data?.message ?? "Task progress could not be updated.";
                api["error"]({ title: "Error", description: message });
            });
    }

    return { isAssigned, updateProgress, contextHolder };
}

function CompleteCheckbox(props: { task: TaskWithRelations; eventId: number; isTaskManager: boolean }) {
    const { isAssigned, updateProgress, contextHolder } = useTaskProgress(props.task, props.eventId);
    const canEdit = props.isTaskManager || isAssigned;
    const waitingMessage = waitingOnMessage(props.task);

    return <>
        {contextHolder}
        <Tooltip title={canEdit ? waitingMessage : null}>
            <Checkbox
                disabled={!canEdit || waitingMessage !== null}
                checked={props.task.progress === "completed"}
                onChange={(e) => updateProgress(e.target.checked ? "completed" : "in_progress")}
                aria-label={waitingMessage ?? `Mark ${props.task.title} as complete`}
            />
        </Tooltip>
    </>
}

function ProgressSelect(props: { task: TaskWithRelations; eventId: number; isTaskManager: boolean }) {
    const { isAssigned, updateProgress, contextHolder } = useTaskProgress(props.task, props.eventId);
    const canEdit = props.isTaskManager || isAssigned;

    if (!canEdit) return <>
        {contextHolder}
        <Tag color={progressColor[props.task.progress]}>{progressLabel(props.task.progress)}</Tag>
    </>

    return <>
        {contextHolder}
        <Select
            size="small"
            value={props.task.progress}
            options={progressOptions(waitingOnMessage(props.task) !== null)}
            style={{ width: "100%" }}
            onChange={updateProgress}
        />
    </>
}