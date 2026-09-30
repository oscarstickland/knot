import {
    type CreateTaskData,
    CreateTaskSchema,
    taskPriorities,
    type TaskWithRelations
} from "@knot/backend/tasks";
import type { ClubMember } from "@knot/backend/user";
import { useState } from "react";
import { Button, DatePicker, Form, Input, Modal, Select, notification } from "antd";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AxiosInstance } from "@/lib/fetcher.tsx";
import useSWR, { mutate } from "swr";
import dayjs from "dayjs";
import { EditOutlined, PlusOutlined } from "@ant-design/icons";
import { z } from "zod";
import { useAppNotification } from "@/lib/useAppNotification";

const { TextArea } = Input;

const priorityOptions = taskPriorities.map((priority) => ({
    label: priority.charAt(0).toUpperCase() + priority.slice(1),
    value: priority
}));

type TaskFormInput = z.input<typeof CreateTaskSchema>;
type TaskFormOutput = z.output<typeof CreateTaskSchema>;

type TaskModalProps =
    | { mode: "create"; eventId: number; task?: never; trigger?: never }
    | { mode: "update"; eventId: number; task: TaskWithRelations; trigger?: React.ReactNode };

export function TaskModal({ mode, eventId, task, trigger }: TaskModalProps) {
    const [open, setOpen] = useState(false);
    const [api, contextHolder] = useAppNotification();
    const isEditMode = mode === "update";

    const { data: members } = useSWR<ClubMember[]>("/user");
    const { data: eventTasks } = useSWR<TaskWithRelations[]>(`/tasks?eventId=${eventId}`);
    const dependencyOptions = (eventTasks ?? [])
        .filter((candidate) => candidate.id !== task?.id)
        .map((candidate) => ({ label: candidate.title, value: candidate.id }));

    const { handleSubmit, formState: { errors }, control, reset } = useForm<TaskFormInput, any, TaskFormOutput>({
        resolver: zodResolver(CreateTaskSchema),
        defaultValues: isEditMode ? {
            eventId,
            title: task.title,
            description: task.description,
            priority: task.priority,
            dueDate: task.dueDate ? new Date(task.dueDate).toISOString() : undefined,
            assigneeIds: task.assignments.map((assignment) => assignment.userId),
            dependencyIds: task.dependsOn.map((dependency) => dependency.dependsOnTaskId)
        } : {
            eventId,
            title: "",
            description: "",
            priority: "medium",
            dueDate: undefined,
            assigneeIds: [],
            dependencyIds: []
        }
    });

    const handleCancel = () => {
        setOpen(false);
        reset();
    }

    const submit = (data: CreateTaskData) => {
        const request = isEditMode
            ? AxiosInstance.put(`/tasks/${task.id}`, data)
            : AxiosInstance.post(`/tasks`, data);

        request.then(async (response) => {
            if (response.status === 200 || response.status === 201) {
                if (isEditMode) {
                    await mutate(`/tasks/${task.id}`);
                }
                await mutate(`/tasks?eventId=${eventId}`);
                setOpen(false);

                if (!isEditMode) reset();

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
        <Modal
            open={open}
            onOk={handleSubmit(submit)}
            onCancel={handleCancel}
            title={`${isEditMode ? "Edit" : "New"} Task`}
            centered
            width={560}
        >
            <form onSubmit={handleSubmit(submit)}>
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
        </Modal>
        {trigger
            ? <span onClick={() => setOpen(true)}>{trigger}</span>
            : <Button
                onClick={() => setOpen(!open)}
                icon={isEditMode ? <EditOutlined /> : <PlusOutlined />}
            >{isEditMode ? "Edit Task" : "New Task"}</Button>
        }
    </>
}
