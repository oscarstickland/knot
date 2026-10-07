import { useState } from "react";
import { Avatar, Button, Empty, Form, Input, Popconfirm, Result, Skeleton, Space, Tooltip, Typography, theme } from "antd";
import useSWR, { mutate } from "swr";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { DeleteOutlined, EditOutlined, SendOutlined, UserOutlined } from "@ant-design/icons";
import { CreateTaskCommentSchema, UpdateTaskCommentSchema, type TaskCommentWithAuthor } from "@knot/backend/tasks";
import { AxiosInstance } from "@/lib/fetcher.tsx";
import { useUser } from "@/lib/auth.tsx";
import { useAppNotification } from "@/lib/useAppNotification";

dayjs.extend(relativeTime);

const { Text } = Typography;
const { TextArea } = Input;

type CommentFormInput = z.input<typeof CreateTaskCommentSchema>;
type CommentFormOutput = z.output<typeof CreateTaskCommentSchema>;

function commentsKey(taskId: number) {
    return `/tasks/${taskId}/comments`;
}

// Refreshes the thread and the task list (which carries the comment count).
async function refreshComments(taskId: number, eventId: number) {
    await Promise.all([
        mutate(commentsKey(taskId)),
        mutate(`/tasks?eventId=${eventId}`)
    ]);
}

export function TaskComments(props: { taskId: number; eventId: number }) {
    const { data: comments, isLoading, error } = useSWR<TaskCommentWithAuthor[]>(commentsKey(props.taskId));

    return <div>
        <Text type="secondary" style={{ fontSize: "12px" }}>Comments:</Text>
        <div style={{ marginTop: "8px", marginBottom: "12px" }}>
            {error
                ? <Result status="error" title="Retrieval Error" subTitle="Something went wrong loading comments for this task. Try refreshing the page." />
                : isLoading
                    ? <Skeleton active avatar paragraph={{ rows: 1 }} />
                    : (comments ?? []).length === 0
                        ? <Empty description="No comments yet" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: "8px 0" }} />
                        : <Space direction="vertical" size={12} style={{ width: "100%" }}>
                            {(comments ?? []).map((comment) => (
                                <CommentItem key={comment.id} comment={comment} eventId={props.eventId} />
                            ))}
                        </Space>
            }
        </div>
        {!error && <NewCommentForm taskId={props.taskId} eventId={props.eventId} />}
    </div>
}

function CommentItem(props: { comment: TaskCommentWithAuthor; eventId: number }) {
    const { token } = theme.useToken();
    const user = useUser();
    const [api, contextHolder] = useAppNotification();
    const [isEditing, setIsEditing] = useState(false);
    const { comment } = props;

    const isAuthor = comment.authorId === user.id;
    const canDelete = isAuthor || user.role === "admin" || user.role === "exec";

    const deleteComment = () => {
        AxiosInstance.delete(`/tasks/${comment.taskId}/comments/${comment.id}`)
            .then(async () => {
                await refreshComments(comment.taskId, props.eventId);
            })
            .catch((err) => {
                const message = err?.response?.data?.message ?? "Comment could not be deleted.";
                api["error"]({ title: "Error", description: message });
            });
    }

    return <div style={{ display: "flex", gap: "8px" }}>
        {contextHolder}
        <Avatar size="small" icon={<UserOutlined />} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
                <Text strong>{comment.author?.name ?? `User ${comment.authorId}`}</Text>
                <Tooltip title={dayjs(comment.createdAt).format("D MMM YYYY h:mm A")}>
                    <Text type="secondary" style={{ fontSize: "12px" }}>{dayjs(comment.createdAt).fromNow()}</Text>
                </Tooltip>
                {comment.updatedAt && <Tooltip title={`Edited ${dayjs(comment.updatedAt).format("D MMM YYYY h:mm A")}`}>
                    <Text type="secondary" style={{ fontSize: "12px" }}>(edited)</Text>
                </Tooltip>}
                {!isEditing && (isAuthor || canDelete) && <Space size={0} style={{ marginLeft: "auto" }}>
                    {isAuthor && <Button size="small" type="text" icon={<EditOutlined />} onClick={() => setIsEditing(true)} aria-label="Edit comment" />}
                    {canDelete && <Popconfirm
                        title="Delete comment"
                        description="Are you sure you want to delete this comment?"
                        onConfirm={deleteComment}
                        okText="Delete"
                        okButtonProps={{ danger: true }}
                    >
                        <Button size="small" type="text" icon={<DeleteOutlined />} aria-label="Delete comment" />
                    </Popconfirm>}
                </Space>}
            </div>
            {isEditing
                ? <EditCommentForm comment={comment} eventId={props.eventId} onDone={() => setIsEditing(false)} />
                : <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", color: token.colorText }}>{comment.body}</div>
            }
        </div>
    </div>
}

function EditCommentForm(props: { comment: TaskCommentWithAuthor; eventId: number; onDone: () => void }) {
    const [api, contextHolder] = useAppNotification();
    const { handleSubmit, formState: { errors, isSubmitting }, control } = useForm<CommentFormInput, any, CommentFormOutput>({
        resolver: zodResolver(UpdateTaskCommentSchema),
        defaultValues: { body: props.comment.body }
    });

    const submit = (data: CommentFormOutput) => {
        return AxiosInstance.put(`/tasks/${props.comment.taskId}/comments/${props.comment.id}`, data)
            .then(async () => {
                await refreshComments(props.comment.taskId, props.eventId);
                props.onDone();
            })
            .catch((err) => {
                const message = err?.response?.data?.message ?? "Comment could not be updated.";
                api["error"]({ title: "Error", description: message });
            });
    }

    return <>
        {contextHolder}
        <form onSubmit={handleSubmit(submit)} style={{ marginTop: "4px" }}>
            <Form.Item
                validateStatus={errors.body ? "error" : ""}
                help={errors.body?.message}
                style={{ marginBottom: "8px" }}
            >
                <Controller
                    name="body"
                    control={control}
                    render={({ field }) => <TextArea
                        {...field}
                        autoSize={{ minRows: 1, maxRows: 6 }}
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSubmit(submit)();
                            if (e.key === "Escape") props.onDone();
                        }}
                    />}
                />
            </Form.Item>
            <Space size={8}>
                <Button size="small" type="primary" htmlType="submit" loading={isSubmitting}>Save</Button>
                <Button size="small" onClick={props.onDone}>Cancel</Button>
            </Space>
        </form>
    </>
}

function NewCommentForm(props: { taskId: number; eventId: number }) {
    const [api, contextHolder] = useAppNotification();
    const { handleSubmit, formState: { errors, isSubmitting }, control, reset } = useForm<CommentFormInput, any, CommentFormOutput>({
        resolver: zodResolver(CreateTaskCommentSchema),
        defaultValues: { body: "" }
    });

    const submit = (data: CommentFormOutput) => {
        return AxiosInstance.post(`/tasks/${props.taskId}/comments`, data)
            .then(async () => {
                await refreshComments(props.taskId, props.eventId);
                reset();
            })
            .catch((err) => {
                const message = err?.response?.data?.message ?? "Comment could not be added.";
                api["error"]({ title: "Error", description: message });
            });
    }

    return <>
        {contextHolder}
        <form onSubmit={handleSubmit(submit)} style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
            <Form.Item
                validateStatus={errors.body ? "error" : ""}
                help={errors.body?.message}
                style={{ marginBottom: 0, flex: 1 }}
            >
                <Controller
                    name="body"
                    control={control}
                    render={({ field }) => <TextArea
                        {...field}
                        autoSize={{ minRows: 1, maxRows: 6 }}
                        placeholder="Write a comment... (Ctrl+Enter to send)"
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSubmit(submit)();
                        }}
                    />}
                />
            </Form.Item>
            <Button type="primary" icon={<SendOutlined />} htmlType="submit" loading={isSubmitting}>Comment</Button>
        </form>
    </>
}
