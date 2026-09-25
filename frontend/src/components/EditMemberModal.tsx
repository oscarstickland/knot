import { Button, Form, Input, Modal, Popconfirm, Select, notification } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AxiosInstance } from "@/lib/fetcher.tsx";
import { mutate } from "swr";
import { z } from "zod";
import { UpdateMemberSchema, type ClubMember } from "@knot/backend/user";
import { useAppNotification } from "@/lib/useAppNotification";

const EditMemberFormSchema = UpdateMemberSchema.extend({
    password: z.union([z.literal(""), UpdateMemberSchema.shape.password])
});

type EditMemberFormData = z.infer<typeof EditMemberFormSchema>;

interface EditMemberModalProps {
    member: ClubMember;
    onClose: () => void;
}

export function EditMemberModal({ member, onClose }: EditMemberModalProps) {
    const [api, contextHolder] = useAppNotification();

    const { handleSubmit, formState: { errors }, control } = useForm<EditMemberFormData>({
        resolver: zodResolver(EditMemberFormSchema),
        defaultValues: {
            name: member.name,
            email: member.email,
            role: member.role === "admin" ? "exec" : member.role,
            password: ""
        }
    });

    const submit = (data: EditMemberFormData) => {
        const payload = {
            name: data.name,
            email: data.email,
            role: data.role,
            ...(data.password ? { password: data.password } : {})
        };

        AxiosInstance.put(`/user/${member.id}`, payload)
            .then(async () => {
                await mutate("/user");
                onClose();
                api['success']({
                    title: "Success",
                    description: "Member has been updated."
                });
            })
            .catch((error) => {
                const message = error?.response?.data?.message ?? "Member could not be updated.";
                api['error']({
                    title: "Error",
                    description: message
                });
            });
    }

    const deleteMember = () => {
        AxiosInstance.delete(`/user/${member.id}`)
            .then(async () => {
                await mutate("/user");
                onClose();
                api['success']({
                    title: "Success",
                    description: "Member has been deleted."
                });
            })
            .catch((error) => {
                const message = error?.response?.data?.message ?? "Member could not be deleted.";
                api['error']({
                    title: "Error",
                    description: message
                });
            });
    }

    return <>
        {contextHolder}
        <Modal
            open
            onOk={handleSubmit(submit)}
            onCancel={onClose}
            title="Edit Member"
            centered
            footer={(_, { OkBtn, CancelBtn }) => (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <Popconfirm
                        title="Delete member"
                        description={`Are you sure you want to delete ${member.name}?`}
                        onConfirm={deleteMember}
                        okText="Delete"
                        okButtonProps={{ danger: true }}
                    >
                        <Button danger icon={<DeleteOutlined />}>Delete</Button>
                    </Popconfirm>
                    <div style={{ display: "flex", gap: "8px" }}>
                        <CancelBtn />
                        <OkBtn />
                    </div>
                </div>
            )}
        >
            <form onSubmit={handleSubmit(submit)}>
                <Form.Item
                    label="Name"
                    validateStatus={errors.name ? "error" : ""}
                    help={errors.name?.message}
                >
                    <Controller
                        name="name"
                        control={control}
                        render={({ field }) => <Input {...field} placeholder="Name" />}
                    />
                </Form.Item>

                <Form.Item
                    label="Email"
                    validateStatus={errors.email ? "error" : ""}
                    help={errors.email?.message}
                >
                    <Controller
                        name="email"
                        control={control}
                        render={({ field }) => <Input {...field} placeholder="Email" />}
                    />
                </Form.Item>

                <Form.Item
                    label="Account Type"
                    validateStatus={errors.role ? "error" : ""}
                    help={errors.role?.message}
                >
                    <Controller
                        name="role"
                        control={control}
                        render={({ field }) => (
                            <Select
                                {...field}
                                options={[
                                    { value: "standard", label: "Standard" },
                                    { value: "exec", label: "Exec" }
                                ]}
                            />
                        )}
                    />
                </Form.Item>

                <Form.Item
                    label="New Password"
                    validateStatus={errors.password ? "error" : ""}
                    help={errors.password?.message ?? "Leave blank to keep the current password"}
                >
                    <Controller
                        name="password"
                        control={control}
                        render={({ field }) => (
                            <Input.Password {...field} placeholder="New password" autoComplete="new-password" />
                        )}
                    />
                </Form.Item>
            </form>
        </Modal>
    </>
}
