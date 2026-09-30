import { useState } from "react";
import { Button, Form, Input, Modal } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AxiosInstance } from "@/lib/fetcher.tsx";
import { mutate } from "swr";
import { CreateCategorySchema, type CreateCategoryData } from "@knot/backend/budget";
import { useAppNotification } from "@/lib/useAppNotification";

export function CreateBudgetCategoryModal() {
    const [open, setOpen] = useState(false);
    const [api, contextHolder] = useAppNotification();

    const { handleSubmit, formState: { errors }, control, reset } = useForm<CreateCategoryData>({
        resolver: zodResolver(CreateCategorySchema),
        defaultValues: { name: "" }
    });

    const handleCancel = () => {
        setOpen(false);
        reset();
    }

    const submit = (data: CreateCategoryData) => {
        AxiosInstance.post("/budget/categories", data)
            .then(async () => {
                await mutate("/budget/categories");
                setOpen(false);
                reset();
                api['success']({
                    title: "Success",
                    description: "Budget category has been created."
                });
            })
            .catch((error) => {
                const message = error?.response?.data?.message ?? "Category could not be created.";
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
            title="Create Budget Category"
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
                        render={({ field }) => <Input {...field} placeholder="e.g. Venue" />}
                    />
                </Form.Item>
            </form>
        </Modal>
        <Button icon={<PlusOutlined />} onClick={() => setOpen(true)}>New Category</Button>
    </>
}
