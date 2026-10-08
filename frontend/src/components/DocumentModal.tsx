import { useState } from "react";
import { Button, Form, Input, Modal, Popconfirm } from "antd";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { mutate } from "swr";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { CreateEventDocumentSchema, type CreateEventDocumentData, type EventDocumentWithUser } from "@knot/backend/event-documents";
import { AxiosInstance } from "@/lib/fetcher.tsx";
import { useAppNotification } from "@/lib/useAppNotification";

type DocumentModalProps =
    | { mode: "create"; eventId: number; document?: never }
    | { mode: "update"; eventId: number; document: EventDocumentWithUser };

export function DocumentModal({ mode, eventId, document }: DocumentModalProps) {
    const [open, setOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [api, contextHolder] = useAppNotification();
    const isEditMode = mode === "update";

    const { handleSubmit, formState: { errors }, control, reset } = useForm<CreateEventDocumentData>({
        resolver: zodResolver(CreateEventDocumentSchema),
        defaultValues: isEditMode
            ? { title: document.title, url: document.url }
            : { title: "", url: "" }
    });

    const handleCancel = () => {
        setOpen(false);
        reset();
    }

    const submit = (data: CreateEventDocumentData) => {
        setIsSubmitting(true);
        const request = isEditMode
            ? AxiosInstance.put(`/event-documents/${document.id}`, data)
            : AxiosInstance.post(`/events/${eventId}/documents`, data);

        request.then(async () => {
            await mutate(`/events/${eventId}/documents`);
            setOpen(false);
            if (!isEditMode) reset();
            api['success']({
                title: "Success",
                description: `Link has been ${isEditMode ? "updated" : "added"}.`
            });
        })
        .catch((error) => {
            const message = error?.response?.data?.message
                ?? `Link could not be ${isEditMode ? "updated" : "added"}.`;
            api['error']({ title: "Error", description: message });
        })
        .finally(() => setIsSubmitting(false));
    }

    const deleteDocument = () => {
        if (!isEditMode) return;

        AxiosInstance.delete(`/event-documents/${document.id}`)
            .then(async () => {
                await mutate(`/events/${eventId}/documents`);
                setOpen(false);
                api['success']({ title: "Success", description: "Link has been removed." });
            })
            .catch((error) => {
                const message = error?.response?.data?.message ?? "Link could not be removed.";
                api['error']({ title: "Error", description: message });
            });
    }

    return <>
        {contextHolder}
        <Modal
            open={open}
            onOk={handleSubmit(submit)}
            onCancel={handleCancel}
            confirmLoading={isSubmitting}
            okText={isEditMode ? "Save" : "Add Link"}
            title={`${isEditMode ? "Edit" : "Add"} Link`}
            centered
            footer={isEditMode ? (_, { OkBtn, CancelBtn }) => (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <Popconfirm
                        title="Remove link"
                        description="Are you sure you want to remove this link?"
                        onConfirm={deleteDocument}
                        okText="Remove"
                        okButtonProps={{ danger: true }}
                    >
                        <Button danger icon={<DeleteOutlined />}>Remove</Button>
                    </Popconfirm>
                    <div style={{ display: "flex", gap: "8px" }}>
                        <CancelBtn />
                        <OkBtn />
                    </div>
                </div>
            ) : undefined}
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
                        render={({ field }) => <Input {...field} maxLength={255} placeholder="e.g. Run sheet" />}
                    />
                </Form.Item>

                <Form.Item
                    label="Link"
                    validateStatus={errors.url ? "error" : ""}
                    help={errors.url?.message}
                >
                    <Controller
                        name="url"
                        control={control}
                        render={({ field }) => <Input {...field} type="url" placeholder="https://" />}
                    />
                </Form.Item>
            </form>
        </Modal>
        {isEditMode
            ? <Button type="text" aria-label={`Edit ${document.title}`} icon={<EditOutlined />} onClick={() => setOpen(true)} />
            : <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>Add Link</Button>
        }
    </>
}
