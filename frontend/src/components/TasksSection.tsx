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
    Tabs,
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
import { taskListKey } from "@/lib/tasks.ts";
import { TaskModal } from "@/components/TaskModal.tsx";
import dayjs from "dayjs";
import { EditOutlined, InboxOutlined, LinkOutlined, PlusOutlined, UndoOutlined, UserOutlined } from "@ant-design/icons";

const { Text } = Typography;

const priorityColor: Record<string, string> = {
    low: "default",
    medium: "gold",
    high: "red"
};

const progressColor: Record<string, string> = {
    backlog: "default",
    in_progress: "blue",
    in_review: "purple",
    completed: "green"
};

const progressLabel = (progress: string) =>
    progress.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");

const progressOptions = taskProgressStates.map((progress) => ({
    label: progressLabel(progress),
    value: progress
}));

export function TasksSection(props: { eventId: number }) {
    const { token } = theme.useToken();
    const user = useUser();
    const isTaskManager = user.role === "admin" || user.role === "exec";
    const [showArchived, setShowArchived] = useState(false);
    const { data: tasks, isLoading, error } = useSWR<TaskWithRelations[]>(taskListKey(props.eventId, showArchived));
    const { data: members } = useSWR<ClubMember[]>(isTaskManager ? "/user" : null);
    const memberById = new Map((members ?? []).map((member) => [member.id, member]));

    if (error) {
        return <Result status="error" title="Retrieval Error" subTitle="Unable to fetch tasks." />
    }

    return <div style={{ marginTop: "32px" }}>
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: "16px"
        }}>
            <Text strong style={{ fontSize: "16px" }}>Tasks</Text>
            { isTaskManager && !showArchived ? <TaskModal mode="create" eventId={props.eventId} /> : "" }
        </div>

        { isTaskManager
            ? <Tabs
                activeKey={showArchived ? "archived" : "active"}
                onChange={(key) => setShowArchived(key === "archived")}
                items={[
                    { key: "active", label: "Active" },
                    { key: "archived", label: "Archived" }
                ]}
            />
            : ""
        }

        <Table
            rowKey="id"
            loading={isLoading}
            dataSource={tasks ?? []}
            pagination={false}
            locale={{ emptyText: <Empty description={showArchived ? "No archived tasks" : "No tasks yet"} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
            expandable={{
                expandedRowRender: (task) => (
                    <TaskDetailsRow task={task} eventId={props.eventId} isTaskManager={isTaskManager} />
                )
            }}
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
                    width: 80,
                    render: (_, task) => isTaskManager
                        ? <Space size={0}>
                            { task.archived
                                ? null
                                : <TaskModal
                                    mode="update"
                                    eventId={props.eventId}
                                    task={task}
                                    trigger={<Button size="small" type="text" icon={<EditOutlined />} />}
                                /> }
                            <ArchiveButton task={task} eventId={props.eventId} />
                        </Space>
                        : null
                }
            ] as TableProps<TaskWithRelations>['columns']}
        />
    </div>
}

function ProgressSelect(props: { task: TaskWithRelations; eventId: number; isTaskManager: boolean }) {
    const user = useUser();
    const [api, contextHolder] = notification.useNotification();
    const isAssigned = props.task.assignments.some((assignment) => assignment.userId === user.id);
    const canEdit = (props.isTaskManager || isAssigned) && !props.task.archived;

    const updateProgress = (progress: string) => {
        AxiosInstance.patch(`/tasks/${props.task.id}/progress`, { progress })
            .then(async () => {
                await mutate(taskListKey(props.eventId));
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

function ArchiveButton(props: { task: TaskWithRelations; eventId: number }) {
    const [api, contextHolder] = notification.useNotification();
    const isArchived = props.task.archived;

    const toggleArchived = () => {
        AxiosInstance.patch(`/tasks/${props.task.id}/archive`, { archived: !isArchived })
            .then(async () => {
                // The task moves between the two lists, so both need revalidating.
                await mutate(taskListKey(props.eventId, false));
                await mutate(taskListKey(props.eventId, true));
                api["success"]({
                    title: "Success",
                    description: `Task has been ${isArchived ? "restored" : "archived"}.`
                });
            })
            .catch((err) => {
                const message = err?.response?.data?.message
                    ?? `Task could not be ${isArchived ? "restored" : "archived"}.`;
                api["error"]({ title: "Error", description: message });
            });
    }

    return <>
        {contextHolder}
        <Tooltip title={isArchived ? "Restore" : "Archive"}>
            <Button
                size="small"
                type="text"
                icon={isArchived ? <UndoOutlined /> : <InboxOutlined />}
                onClick={toggleArchived}
            />
        </Tooltip>
    </>
}

function TaskDetailsRow(props: { task: TaskWithRelations; eventId: number; isTaskManager: boolean }) {
    const { token } = theme.useToken();
    const user = useUser();
    // An archived task may depend on active ones, so titles are resolved across both lists.
    const { data: activeTasks } = useSWR<TaskWithRelations[]>(taskListKey(props.eventId, false));
    const { data: archivedTasks } = useSWR<TaskWithRelations[]>(
        props.isTaskManager ? taskListKey(props.eventId, true) : null
    );
    const taskById = new Map(
        [...(activeTasks ?? []), ...(archivedTasks ?? [])].map((task) => [task.id, task])
    );
    const isAssigned = props.task.assignments.some((assignment) => assignment.userId === user.id);
    const canAddDocument = (props.isTaskManager || isAssigned) && !props.task.archived;

    return <div style={{ padding: "8px 16px", background: token.colorBgLayout }}>
        {props.task.dependsOn.length > 0 && <div style={{ marginBottom: "12px" }}>
            <Text type="secondary" style={{ fontSize: "12px" }}>Depends on: </Text>
            <Space size={[4, 4]} wrap>
                {props.task.dependsOn.map((dependency) => {
                    const dependencyTask = taskById.get(dependency.dependsOnTaskId);
                    return <Tag key={dependency.dependsOnTaskId} color={dependencyTask?.progress === "completed" ? "green" : "default"}>
                        {dependencyTask?.title ?? `Task ${dependency.dependsOnTaskId}`}
                    </Tag>
                })}
            </Space>
        </div>}

        <Text type="secondary" style={{ fontSize: "12px" }}>Links:</Text>
        <div style={{ marginTop: "4px", marginBottom: "8px" }}>
            {props.task.documents.length === 0
                ? <Text type="secondary" style={{ fontSize: "12px" }}>No links added yet.</Text>
                : <Space direction="vertical" size={2}>
                    {props.task.documents.map((document) => (
                        <a key={document.id} href={document.url} target="_blank" rel="noreferrer">
                            <LinkOutlined /> {document.url}
                        </a>
                    ))}
                </Space>
            }
        </div>

        {canAddDocument && <AddDocumentForm taskId={props.task.id} eventId={props.eventId} />}
    </div>
}

const AddDocumentFormSchema = AddTaskDocumentSchema;
type AddDocumentFormData = z.infer<typeof AddDocumentFormSchema>;

function AddDocumentForm(props: { taskId: number; eventId: number }) {
    const [api, contextHolder] = notification.useNotification();
    const { handleSubmit, formState: { errors }, control, reset } = useForm<AddDocumentFormData>({
        resolver: zodResolver(AddDocumentFormSchema),
        defaultValues: { url: "" }
    });

    const submit = (data: AddDocumentFormData) => {
        AxiosInstance.post(`/tasks/${props.taskId}/documents`, data)
            .then(async () => {
                await mutate(taskListKey(props.eventId));
                reset();
            })
            .catch((err) => {
                const message = err?.response?.data?.message ?? "Link could not be added.";
                api["error"]({ title: "Error", description: message });
            });
    }

    return <>
        {contextHolder}
        <form onSubmit={handleSubmit(submit)} style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
            <Form.Item
                validateStatus={errors.url ? "error" : ""}
                help={errors.url?.message}
                style={{ marginBottom: 0, flex: 1 }}
            >
                <Controller
                    name="url"
                    control={control}
                    render={({ field }) => <Input {...field} size="small" placeholder="https://..." />}
                />
            </Form.Item>
            <Button size="small" icon={<PlusOutlined />} htmlType="submit">Add Link</Button>
        </form>
    </>
}
