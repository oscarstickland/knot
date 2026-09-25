import { useState } from "react";
import {
    Avatar,
    Button,
    Empty,
    Form,
    Input,
    Result,
    Select,
    Space,
    Table,
    Tag,
    Tooltip,
    Typography,
    notification,
    theme,
    type TableProps
} from "antd";
import useSWR, { mutate } from "swr";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
    AddTaskDocumentSchema,
    taskProgressStates,
    type TaskWithRelations
} from "@knot/backend/tasks";
import type { ClubMember } from "@knot/backend/user";
import { AxiosInstance } from "@/lib/fetcher.tsx";
import { useUser } from "@/lib/auth.tsx";
import { TaskModal } from "@/components/TaskModal.tsx";
import dayjs from "dayjs";
import { EditOutlined, LinkOutlined, PlusOutlined, UserOutlined } from "@ant-design/icons";
import { progressColor, progressLabel } from "@/components/TaskStatusPill.tsx";
import { useAppNotification } from "@/lib/useAppNotification";
import useApp from "antd/es/app/useApp";

const { Text } = Typography;

const priorityColor: Record<string, string> = {
    low: "default",
    medium: "gold",
    high: "red"
};

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
            { isTaskManager ? <TaskModal mode="create" eventId={props.eventId} /> : "" }
        </div>

        <Table
            rowKey="id"
            loading={isLoading}
            dataSource={tasks ?? []}
            pagination={false}
            locale={{ emptyText: <Empty description="No tasks yet" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
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
                        <ProgressSelect task={task} eventId={props.eventId} isTaskManager={isTaskManager} />
                    )
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
                },
                {
                    key: "actions",
                    title: "",
                    width: 40,
                    render: (_, task) => isTaskManager
                        ? <TaskModal
                            mode="update"
                            eventId={props.eventId}
                            task={task}
                            trigger={<Button size="small" type="text" icon={<EditOutlined />} />}
                        />
                        : null
                }
            ] as TableProps<TaskWithRelations>['columns']}
        />
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