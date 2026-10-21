import { Button, Form, Input, Modal, Popconfirm, Select } from "antd";
import { StopOutlined, UndoOutlined, DeleteOutlined } from "@ant-design/icons";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { mutate } from "swr";
import { z } from "zod";
import { CreateAccountSchema, UpdateAccountSchema } from "@knot/backend/super-admin";
import { AxiosInstance } from "@/lib/fetcher.tsx";
import { useAppNotification } from "@/lib/useAppNotification";
import type { Account } from "@/lib/superAdmin";

const EditFormSchema = UpdateAccountSchema.extend({
    password: z.union([z.literal(""), UpdateAccountSchema.shape.password])
});
const CreateFormSchema = CreateAccountSchema;

type AccountFormData = z.infer<typeof EditFormSchema>;

const ROLE_OPTIONS = [
    { value: "standard", label: "Standard" },
    { value: "exec", label: "Exec" },
    { value: "admin", label: "Admin" }
];

interface AccountModalProps {
    clubId: number;
    // Present when editing, absent when creating.
    account?: Account;
    open: boolean;
    onClose: () => void;
}

export function AccountModal({ clubId, account, open, onClose }: AccountModalProps) {
    const [api, contextHolder] = useAppNotification();
    const isEdit = account !== undefined;
    const accountsKey = `/super-admin/clubs/${clubId}/users`;

    const { handleSubmit, formState: { errors, isSubmitting }, control, reset } = useForm<AccountFormData>({
        resolver: zodResolver(isEdit ? EditFormSchema : CreateFormSchema),
        values: {
            name: account?.name ?? "",
            email: account?.email ?? "",
            role: account?.role ?? "standard",
            password: ""
        }
    });

    const refresh = () => Promise.all([mutate(accountsKey), mutate("/super-admin/clubs"), mutate(`/super-admin/clubs/${clubId}`)]);

    const close = () => {
        reset();
        onClose();
    };

    const fail = (error: any, fallback: string) =>
        api["error"]({ title: "Error", description: error?.response?.data?.message ?? fallback });

    const submit = (data: AccountFormData) => {
        const { password, ...rest } = data;
        const request = isEdit
            ? AxiosInstance.put(`/super-admin/users/${account.id}`, { ...rest, ...(password ? { password } : {}) })
            : AxiosInstance.post(accountsKey, data);

        return request
            .then(async () => {
                await refresh();
                close();
                api["success"]({ title: "Success", description: isEdit ? "Account has been updated." : "Account has been created." });
            })
            .catch((error) => fail(error, "Account could not be saved."));
    };

    const runAction = (request: Promise<unknown>, success: string, failure: string) =>
        request
            .then(async () => {
                await refresh();
                close();
                api["success"]({ title: "Success", description: success });
            })
            .catch((error) => fail(error, failure));

    const offboard = () => runAction(
        AxiosInstance.post(`/super-admin/users/${account!.id}/offboard`),
        `${account!.name} has been offboarded.`,
        "Account could not be offboarded."
    );
    const reactivate = () => runAction(
        AxiosInstance.post(`/super-admin/users/${account!.id}/reactivate`),
        `${account!.name} has been reactivated.`,
        "Account could not be reactivated."
    );
    const remove = () => runAction(
        AxiosInstance.delete(`/super-admin/users/${account!.id}`),
        `${account!.name} has been removed.`,
        "Account could not be removed."
    );

    const isOffboarded = account?.status === "offboarded";

    return <>
        {contextHolder}
        <Modal
            open={open}
            onOk={handleSubmit(submit)}
            onCancel={close}
            confirmLoading={isSubmitting}
            okText={isEdit ? "Save" : "Create"}
            title={isEdit ? "Edit Account" : "Create Account"}
            centered
            destroyOnHidden
            footer={(_, { OkBtn, CancelBtn }) => (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", gap: "8px" }}>
                        {isEdit && (isOffboarded
                            ? <Button icon={<UndoOutlined />} onClick={reactivate}>Reactivate</Button>
                            : <Popconfirm
                                title="Offboard account"
                                description={`Offboard ${account.name}? They'll be unassigned from tasks and won't be able to log in.`}
                                onConfirm={offboard}
                                okText="Offboard"
                                okButtonProps={{ danger: true }}
                            >
                                <Button danger icon={<StopOutlined />}>Offboard</Button>
                            </Popconfirm>
                        )}
                        {isEdit && (
                            <Popconfirm
                                title="Remove account"
                                description={`Permanently remove ${account.name}? Accounts that have created records can't be removed; offboard those instead.`}
                                onConfirm={remove}
                                okText="Remove"
                                okButtonProps={{ danger: true }}
                            >
                                <Button danger type="text" icon={<DeleteOutlined />}>Remove</Button>
                            </Popconfirm>
                        )}
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                        <CancelBtn />
                        <OkBtn />
                    </div>
                </div>
            )}
        >
            <form onSubmit={handleSubmit(submit)}>
                <Form.Item label="Name" validateStatus={errors.name ? "error" : ""} help={errors.name?.message}>
                    <Controller name="name" control={control} render={({ field }) => <Input {...field} placeholder="Name" />} />
                </Form.Item>

                <Form.Item label="Email" validateStatus={errors.email ? "error" : ""} help={errors.email?.message}>
                    <Controller name="email" control={control} render={({ field }) => <Input {...field} placeholder="Email" />} />
                </Form.Item>

                <Form.Item label="Account Type" validateStatus={errors.role ? "error" : ""} help={errors.role?.message}>
                    <Controller name="role" control={control} render={({ field }) => <Select {...field} options={ROLE_OPTIONS} />} />
                </Form.Item>

                <Form.Item
                    label={isEdit ? "New Password" : "Password"}
                    validateStatus={errors.password ? "error" : ""}
                    help={errors.password?.message ?? (isEdit ? "Leave blank to keep the current password" : undefined)}
                >
                    <Controller
                        name="password"
                        control={control}
                        render={({ field }) => <Input.Password {...field} placeholder="Password" autoComplete="new-password" />}
                    />
                </Form.Item>
            </form>
        </Modal>
    </>;
}
