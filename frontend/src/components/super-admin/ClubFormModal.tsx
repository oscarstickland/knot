import { Form, Input, Modal } from "antd";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { mutate } from "swr";
import { ClubFormSchema, type ClubFormData } from "@knot/backend/super-admin";
import { AxiosInstance } from "@/lib/fetcher.tsx";
import { useAppNotification } from "@/lib/useAppNotification";
import type { ClubSummary } from "@/lib/superAdmin";

interface ClubFormModalProps {
    // Present when renaming, absent when creating.
    club?: ClubSummary;
    open: boolean;
    onClose: () => void;
}

export function ClubFormModal({ club, open, onClose }: ClubFormModalProps) {
    const [api, contextHolder] = useAppNotification();
    const isRename = club !== undefined;

    const { handleSubmit, formState: { errors, isSubmitting }, control, reset } = useForm<ClubFormData>({
        resolver: zodResolver(ClubFormSchema),
        values: { name: club?.name ?? "" }
    });

    const close = () => {
        reset();
        onClose();
    };

    const submit = (data: ClubFormData) => {
        const request = isRename
            ? AxiosInstance.patch(`/super-admin/clubs/${club.id}`, data)
            : AxiosInstance.post("/super-admin/clubs", data);

        return request
            .then(async () => {
                await Promise.all([
                    mutate("/super-admin/clubs"),
                    isRename ? mutate(`/super-admin/clubs/${club.id}`) : undefined
                ]);
                close();
                api["success"]({ title: "Success", description: isRename ? "Club has been renamed." : "Club has been created." });
            })
            .catch((error) => {
                api["error"]({
                    title: "Error",
                    description: error?.response?.data?.message ?? "Club could not be saved."
                });
            });
    };

    return <>
        {contextHolder}
        <Modal
            open={open}
            onOk={handleSubmit(submit)}
            onCancel={close}
            confirmLoading={isSubmitting}
            okText={isRename ? "Save" : "Create"}
            title={isRename ? "Rename Club" : "Create Club"}
            centered
            destroyOnHidden
        >
            <form onSubmit={handleSubmit(submit)}>
                <Form.Item label="Club name" validateStatus={errors.name ? "error" : ""} help={errors.name?.message}>
                    <Controller
                        name="name"
                        control={control}
                        render={({ field }) => <Input {...field} placeholder="Club name" autoFocus />}
                    />
                </Form.Item>
            </form>
        </Modal>
    </>;
}
