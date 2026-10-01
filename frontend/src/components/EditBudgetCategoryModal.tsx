import { Button, Form, Input, Modal, Popconfirm } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AxiosInstance } from "@/lib/fetcher.tsx";
import { mutate } from "swr";
import { UpdateCategorySchema, type UpdateCategoryData, type BudgetCategory } from "@knot/backend/budget";
import { useAppNotification } from "@/lib/useAppNotification";

interface EditBudgetCategoryModalProps {
    category: BudgetCategory;
    onClose: () => void;
}

export function EditBudgetCategoryModal({ category, onClose }: EditBudgetCategoryModalProps) {
    const [api, contextHolder] = useAppNotification();

    const { handleSubmit, formState: { errors }, control } = useForm<UpdateCategoryData>({
        resolver: zodResolver(UpdateCategorySchema),
        defaultValues: { name: category.name }
    });

    const submit = (data: UpdateCategoryData) => {
        AxiosInstance.put(`/budget/categories/${category.id}`, data)
            .then(async () => {
                await mutate("/budget/categories");
                onClose();
                api['success']({
                    title: "Success",
                    description: "Category has been updated."
                });
            })
            .catch((error) => {
                const message = error?.response?.data?.message ?? "Category could not be updated.";
                api['error']({
                    title: "Error",
                    description: message
                });
            });
    }

    const deleteCategory = () => {
        AxiosInstance.delete(`/budget/categories/${category.id}`)
            .then(async () => {
                await mutate("/budget/categories");
                onClose();
                api['success']({
                    title: "Success",
                    description: "Category has been deleted."
                });
            })
            .catch((error) => {
                const message = error?.response?.data?.message ?? "Category could not be deleted.";
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
            title="Edit Budget Category"
            centered
            footer={(_, { OkBtn, CancelBtn }) => (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <Popconfirm
                        title="Delete category"
                        description={`Are you sure you want to delete "${category.name}"? Categories still in use by a budget or expense cannot be deleted.`}
                        onConfirm={deleteCategory}
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
                        render={({ field }) => <Input {...field} placeholder="e.g. Venue" />}
                    />
                </Form.Item>
            </form>
        </Modal>
    </>
}
