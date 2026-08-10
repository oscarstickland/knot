import { useState } from "react";
import { Button, Form, Input, Modal, Select, notification } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AxiosInstance } from "@/lib/fetcher.tsx";
import { mutate } from "swr";
import { CreateMemberSchema, type CreateMemberData } from "@knot/backend/user";

export function CreateMemberModal() {
    const [open, setOpen] = useState(false);
    const [api, contextHolder] = notification.useNotification();

    const { handleSubmit, formState: { errors }, control, reset } = useForm<CreateMemberData>({
        resolver: zodResolver(CreateMemberSchema),
        defaultValues: { name: "", email: "", role: "standard", password: "" }
    });

    const handleCancel = () => {
        setOpen(false);
        reset();
    }

    const submit = (data: CreateMemberData) => {
        AxiosInstance.post("/user", data)
            .then(async () => {
                await mutate("/user");
                setOpen(false);
                reset();
                api['success']({
                    title: "Success",
                    description: "Member has been created."
                });
            })
            .catch((error) => {
                const message = error?.response?.data?.message ?? "Member could not be created.";
                api['error']({
                    title: "Error",
                    description: message
                });
            });
    }

    return <>
        {contextHolder}
        <Modal
            open={open}
            onOk={handleSubmit(submit)}
            onCancel={handleCancel}
            title="Create Member"
            centered
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
                    label="Password"
                    validateStatus={errors.password ? "error" : ""}
                    help={errors.password?.message}
                >
                    <Controller
                        name="password"
                        control={control}
                        render={({ field }) => (
                            <Input.Password {...field} placeholder="Password" autoComplete="new-password" />
                        )}
                    />
                </Form.Item>
            </form>
        </Modal>
        <Button icon={<PlusOutlined />} onClick={() => setOpen(true)}>New Member</Button>
    </>
}
