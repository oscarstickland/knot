import { useState } from "react";
import {
    Avatar,
    Empty,
    Result,
    Select,
    Space,
    Table,
    Tag,
    Tooltip,
    Typography,
    theme,
    type TableProps
} from "antd";
import useSWR, { mutate } from "swr";
import { taskProgressStates, type TaskWithRelations } from "@knot/backend/tasks";
import type { ClubMember } from "@knot/backend/user";
import { AxiosInstance } from "@/lib/fetcher.tsx";
import { useUser } from "@/lib/auth.tsx";
import { TaskDrawer } from "@/components/TaskDrawer.tsx";
import dayjs from "dayjs";
import { UserOutlined } from "@ant-design/icons";
import { priorityColor, progressColor, progressLabel } from "@/components/TaskStatusPill.tsx";
import { useAppNotification } from "@/lib/useAppNotification";

const { Text } = Typography;

const progressOptions = taskProgressStates.map((progress) => ({
    label: progressLabel(progress),
    value: progress
}));

export function TasksSection(props: { eventId: number }) {
    const { token } = theme.useToken();
    const user = useUser();
    const isTaskManager = user.role === "admin" || user.role === "exec";
    const { data: tasks, isLoading, error } = useSWR<TaskWithRelations[]>(`/tasks?eventId=${props.eventId}`);
    const { data: members } = useSWR<ClubMember[]>(isTaskManager ? "/user" : null);
    const memberById = new Map((members ?? []).map((member) => [member.id, member]));
    const taskById = new Map((tasks ?? []).map((task) => [task.id, task]));
    const [openTaskId, setOpenTaskId] = useState<number | null>(null);

    if (error) {
        return <Result status="error" title="Retrieval Error" subTitle="Unable to fetch tasks." />
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
            locale={{ emptyText: <Empty description="No tasks yet" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
            onRow={(task) => ({
                onClick: () => setOpenTaskId(task.id),
                style: { cursor: "pointer" }
            })}
            columns={[
                {
                    key: "title",
                    title: "Task",
                    dataIndex: "title",
                    render: (title, task) => <div>
                        <Text strong>{title}</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: "12px" }}>{task.description}</Text>
                    </div>
                },
                {
                    key: "priority",
                    title: "Priority",
                    dataIndex: "priority",
                    width: 110,
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
                    render: (_, task) => task.dependsOn.length === 0
                        ? <Text type="secondary">—</Text>
                        : <Space size={[4, 4]} wrap>
                            {task.dependsOn.map((dependency) => {
                                const dependencyTask = taskById.get(dependency.dependsOnTaskId);
                                const isBlocked = dependencyTask?.progress !== "completed";
                                return <Tag key={dependency.dependsOnTaskId} color={isBlocked ? "red" : "green"}>
                                    {dependencyTask?.title ?? `Task ${dependency.dependsOnTaskId}`}
                                </Tag>
                            })}
                        </Space>
                },
                {
                    key: "assignees",
                    title: "Assignees",
                    width: 130,
                    render: (_, task) => (
                        <Avatar.Group max={{ count: 3 }}>
                            {task.assignments.map((assignment) => {
                                const member = memberById.get(assignment.userId);
                                return <Tooltip key={assignment.userId} title={member?.name ?? `User ${assignment.userId}`}>
                                    <Avatar size="small" icon={<UserOutlined />} />
                                </Tooltip>
                            })}
                        </Avatar.Group>
                    )
                },
                {
                    key: "dueDate",
                    title: "Due",
                    width: 150,
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
                memberById={memberById}
                open={openTaskId === task.id}
                onOpenChange={(value) => setOpenTaskId(value ? task.id : null)}
            />
        ))}
    </div>
}

function ProgressSelect(props: { task: TaskWithRelations; eventId: number; isTaskManager: boolean }) {
    const user = useUser();
    const [api, contextHolder] = useAppNotification();
    const isAssigned = props.task.assignments.some((assignment) => assignment.userId === user.id);
    const canEdit = props.isTaskManager || isAssigned;

    const updateProgress = (progress: string) => {
        AxiosInstance.patch(`/tasks/${props.task.id}/progress`, { progress })
            .then(async () => {
                await mutate(`/tasks?eventId=${props.eventId}`);
            })
            .catch((err) => {
                const message = err?.response?.data?.message ?? "Task progress could not be updated.";
                api["error"]({ title: "Error", description: message });
            });
    }

    if (!canEdit) return <>
        {contextHolder}
        <Tag color={progressColor[props.task.progress]}>{progressLabel(props.task.progress)}</Tag>
    </>

    return <>
        {contextHolder}
        <Select
            size="small"
            value={props.task.progress}
            options={progressOptions}
            style={{ width: "100%" }}
            onChange={updateProgress}
        />
    </>
}