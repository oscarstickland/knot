import {
    type CreateTaskData,
    CreateTaskSchema,
    taskPriorities,
    type TaskWithRelations
} from "@knot/backend/tasks";
import type { ClubMember } from "@knot/backend/user";
import { useEffect, useState } from "react";
import { Avatar, Button, DatePicker, Drawer, Form, Input, Select, Space, Tag, Typography } from "antd";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AxiosInstance } from "@/lib/fetcher.tsx";
import useSWR, { mutate } from "swr";
import dayjs from "dayjs";
import { EditOutlined, PlusOutlined, UserOutlined } from "@ant-design/icons";
import { z } from "zod";
import { useAppNotification } from "@/lib/useAppNotification";
import { priorityColor, TaskStatusPill } from "@/components/TaskStatusPill.tsx";

const { TextArea } = Input;
const { Text } = Typography;

const priorityOptions = taskPriorities.map((priority) => ({
    label: priority.charAt(0).toUpperCase() + priority.slice(1),
    value: priority
}));

type TaskFormInput = z.input<typeof CreateTaskSchema>;
type TaskFormOutput = z.output<typeof CreateTaskSchema>;

type TaskModalProps =
    | { mode: "create"; eventId: number; task?: never; open?: boolean; onOpenChange?: (open: boolean) => void }
    | {
        mode: "update";
        eventId: number;
        task: TaskWithRelations;
        isTaskManager: boolean;
        memberById?: Map<number, ClubMember>;
        open?: boolean;
        onOpenChange?: (open: boolean) => void;
    };

export function TaskModal(props: TaskModalProps) {
    const { mode, eventId } = props;
    const isEditMode = mode === "update";
    const task = isEditMode ? props.task : undefined;
    const canManage = isEditMode ? props.isTaskManager : true;

    const isControlled = props.open !== undefined;
    const [internalOpen, setInternalOpen] = useState(false);
    const open = isControlled ? props.open! : internalOpen;
    const setOpen = (value: boolean) => isControlled ? props.onOpenChange?.(value) : setInternalOpen(value);

    const [view, setView] = useState<"summary" | "form">(isEditMode ? "summary" : "form");
    const [api, contextHolder] = useAppNotification();

    const { data: members } = useSWR<ClubMember[]>(canManage ? "/user" : null);
    const { data: eventTasks } = useSWR<TaskWithRelations[]>(`/tasks?eventId=${eventId}`);
    const taskById = new Map((eventTasks ?? []).map((candidate) => [candidate.id, candidate]));
    const dependencyOptions = (eventTasks ?? [])
        .filter((candidate) => candidate.id !== task?.id)
        .map((candidate) => ({ label: candidate.title, value: candidate.id }));

    const defaultValues = isEditMode ? {
        eventId,
        title: task!.title,
        description: task!.description,
        priority: task!.priority,
        dueDate: task!.dueDate ? new Date(task!.dueDate).toISOString() : undefined,
        assigneeIds: task!.assignments.map((assignment) => assignment.userId),
        dependencyIds: task!.dependsOn.map((dependency) => dependency.dependsOnTaskId)
    } : {
        eventId,
        title: "",
        description: "",
        priority: "medium" as const,
        dueDate: undefined,
        assigneeIds: [],
        dependencyIds: []
    };

    const { handleSubmit, formState: { errors }, control, reset } = useForm<TaskFormInput, any, TaskFormOutput>({
        resolver: zodResolver(CreateTaskSchema),
        defaultValues
    });

    useEffect(() => {
        if (open) setView(isEditMode ? "summary" : "form");
    }, [open, isEditMode]);

    const handleClose = () => {
        setOpen(false);
        reset(defaultValues);
    }

    const handleCancelEdit = () => {
        reset(defaultValues);
        setView("summary");
    }

    const submit = (data: CreateTaskData) => {
        const request = isEditMode
            ? AxiosInstance.put(`/tasks/${task!.id}`, data)
            : AxiosInstance.post(`/tasks`, data);

        request.then(async (response) => {
            if (response.status === 200 || response.status === 201) {
                if (isEditMode) {
                    await mutate(`/tasks/${task!.id}`);
                }
                await mutate(`/tasks?eventId=${eventId}`);
                handleClose();

                api['success']({
                    title: "Success",
                    description: `Task has been ${isEditMode ? "updated" : "created"}.`
                });
            }
        })
        .catch((err) => {
            const message = err?.response?.data?.message
                ?? `Task could not be ${isEditMode ? "updated" : "created"}.`;
            api['error']({ title: "Error", description: message });
        })
    }

    return <>
        {contextHolder}
        <Drawer
            open={open}
            onClose={handleClose}
            title={view === "form" ? `${isEditMode ? "Edit" : "New"} Task` : task?.title}
            width={480}
            footer={
                view === "summary"
                    ? <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5em" }}>
                        <Button onClick={handleClose}>Close</Button>
                        {canManage && <Button type="primary" icon={<EditOutlined />} onClick={() => setView("form")}>Edit</Button>}
                    </div>
                    : <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5em" }}>
                        <Button onClick={isEditMode ? handleCancelEdit : handleClose}>Cancel</Button>
                        <Button type="primary" onClick={handleSubmit(submit)}>Save</Button>
                    </div>
            }
        >
            {view === "summary" && task
                ? <TaskSummary task={task} taskById={taskById} memberById={props.mode === "update" ? props.memberById : undefined} />
                : <form onSubmit={handleSubmit(submit)}>
                    <Form.Item
                        label="Title"
                        validateStatus={errors.title ? "error" : ""}
                        help={errors.title?.message}
                    >
                        <Controller
                            name="title"
                            control={control}
                            render={({ field }) => <Input {...field} placeholder="Task title" />}
                        />
                    </Form.Item>

                    <Form.Item
                        label="Description"
                        validateStatus={errors.description ? "error" : ""}
                        help={errors.description?.message}
                    >
                        <Controller
                            name="description"
                            control={control}
                            render={({ field }) => <TextArea {...field} rows={3} placeholder="What needs to happen?" />}
                        />
                    </Form.Item>

                    <div style={{ display: 'flex', gap: "16px" }}>
                        <Form.Item label="Priority" style={{ flex: 1 }}>
                            <Controller
                                name="priority"
                                control={control}
                                render={({ field }) => (
                                    <Select {...field} options={priorityOptions} />
                                )}
                            />
                        </Form.Item>

                        <Form.Item label="Due Date" style={{ flex: 1 }}>
                            <Controller
                                name="dueDate"
                                control={control}
                                render={({ field }) => (
                                    <DatePicker
                                        showTime
                                        style={{ width: "100%" }}
                                        value={field.value ? dayjs(field.value) : null}
                                        format={"DD/MM/YYYY h:mm A"}
                                        onChange={(date) => field.onChange(date ? date.toISOString() : null)}
                                    />
                                )}
                            />
                        </Form.Item>
                    </div>

                    <Form.Item label="Assignees">
                        <Controller
                            name="assigneeIds"
                            control={control}
                            render={({ field }) => (
                                <Select
                                    {...field}
                                    mode="multiple"
                                    placeholder="Assign club members"
                                    options={(members ?? []).map((member) => ({ label: member.name, value: member.id }))}
                                />
                            )}
                        />
                    </Form.Item>

                    <Form.Item label="Depends On" help="This task can only be completed once these are done">
                        <Controller
                            name="dependencyIds"
                            control={control}
                            render={({ field }) => (
                                <Select
                                    {...field}
                                    mode="multiple"
                                    placeholder="Select blocking tasks"
                                    options={dependencyOptions}
                                />
                            )}
                        />
                    </Form.Item>
                </form>
            }
        </Drawer>
        { !isControlled &&
            <Button
                onClick={() => setOpen(!open)}
                icon={isEditMode ? <EditOutlined /> : <PlusOutlined />}
            >{isEditMode ? "Edit Task" : "New Task"}</Button>
        }
    </>
}

function TaskSummary(props: {
    task: TaskWithRelations;
    taskById: Map<number, TaskWithRelations>;
    memberById?: Map<number, ClubMember>;
}) {
    const { task, taskById, memberById } = props;

    return <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <Space wrap>
            <Tag color={priorityColor[task.priority]}>{task.priority.toUpperCase()}</Tag>
            <TaskStatusPill task={task} />
        </Space>

        <div>
            <Text type="secondary" style={{ fontSize: "12px" }}>Description</Text>
            <div><Text>{task.description}</Text></div>
        </div>

        <div>
            <Text type="secondary" style={{ fontSize: "12px" }}>Due Date</Text>
            <div>
                {task.dueDate
                    ? <Text>{dayjs(task.dueDate).format("D MMM YYYY, h:mm A")}</Text>
                    : <Text type="secondary">No due date</Text>}
            </div>
        </div>

        <div>
            <Text type="secondary" style={{ fontSize: "12px" }}>Assignees</Text>
            <div style={{ marginTop: "4px" }}>
                {task.assignments.length === 0
                    ? <Text type="secondary">Unassigned</Text>
                    : <Space direction="vertical" size={4}>
                        {task.assignments.map((assignment) => (
                            <Space key={assignment.userId} size={8}>
                                <Avatar size="small" icon={<UserOutlined />} />
                                <Text>{memberById?.get(assignment.userId)?.name ?? `User ${assignment.userId}`}</Text>
                            </Space>
                        ))}
                    </Space>
                }
            </div>
        </div>

        <div>
            <Text type="secondary" style={{ fontSize: "12px" }}>Depends On</Text>
            <div style={{ marginTop: "4px" }}>
                {task.dependsOn.length === 0
                    ? <Text type="secondary">No dependencies</Text>
                    : <Space size={[4, 4]} wrap>
                        {task.dependsOn.map((dependency) => {
                            const dependencyTask = taskById.get(dependency.dependsOnTaskId);
                            return <Tag key={dependency.dependsOnTaskId} color={dependencyTask?.progress === "completed" ? "green" : "default"}>
                                {dependencyTask?.title ?? `Task ${dependency.dependsOnTaskId}`}
                            </Tag>
                        })}
                    </Space>
                }
            </div>
        </div>
    </Space>
}
