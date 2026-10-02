import { useState } from "react";
import { Button, Form, Input, InputNumber, Modal, Popconfirm, Select } from "antd";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AxiosInstance } from "@/lib/fetcher.tsx";
import useSWR, { mutate } from "swr";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { CreateExpenseSchema, type CreateExpenseData, type EventBudgetSummary, type ExpenseWithRelations } from "@knot/backend/budget";
import { useAppNotification } from "@/lib/useAppNotification";

const { TextArea } = Input;

type ExpenseModalProps =
    | { mode: "create"; eventId: number; expense?: never }
    | { mode: "update"; eventId: number; expense: ExpenseWithRelations };

export function ExpenseModal({ mode, eventId, expense }: ExpenseModalProps) {
    const [open, setOpen] = useState(false);
    const [api, contextHolder] = useAppNotification();
    const isEditMode = mode === "update";

    const { data: budget } = useSWR<EventBudgetSummary>(`/events/${eventId}/budget`);
    const categories = budget?.categories ?? [];

    const { handleSubmit, formState: { errors }, control, reset } = useForm<CreateExpenseData>({
        resolver: zodResolver(CreateExpenseSchema),
        defaultValues: isEditMode ? {
            categoryId: expense.categoryId,
            amount: expense.amount,
            description: expense.description
        } : {
            categoryId: undefined,
            amount: undefined,
            description: ""
        }
    });

    const handleCancel = () => {
        setOpen(false);
        reset();
    }

    const submit = (data: CreateExpenseData) => {
        const request = isEditMode
            ? AxiosInstance.put(`/budget/expenses/${expense.id}`, data)
            : AxiosInstance.post(`/events/${eventId}/expenses`, data);

        request.then(async () => {
            await mutate(`/events/${eventId}/budget`);
            setOpen(false);
            if (!isEditMode) reset();
            api['success']({
                title: "Success",
                description: `Expense has been ${isEditMode ? "updated" : "logged"}.`
            });
        })
        .catch((error) => {
            const message = error?.response?.data?.message
                ?? `Expense could not be ${isEditMode ? "updated" : "logged"}.`;
            api['error']({ title: "Error", description: message });
        });
    }

    const deleteExpense = () => {
        if (!isEditMode) return;

        AxiosInstance.delete(`/budget/expenses/${expense.id}`)
            .then(async () => {
                await mutate(`/events/${eventId}/budget`);
                setOpen(false);
                api['success']({
                    title: "Success",
                    description: "Expense has been deleted."
                });
            })
            .catch((error) => {
                const message = error?.response?.data?.message ?? "Expense could not be deleted.";
                api['error']({ title: "Error", description: message });
            });
    }

    return <>
        {contextHolder}
        <Modal
            open={open}
            onOk={handleSubmit(submit)}
            onCancel={handleCancel}
            title={`${isEditMode ? "Edit" : "Log"} Expense`}
            centered
            footer={isEditMode ? (_, { OkBtn, CancelBtn }) => (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <Popconfirm
                        title="Delete expense"
                        description="Are you sure you want to delete this expense?"
                        onConfirm={deleteExpense}
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
            ) : undefined}
        >
            <form onSubmit={handleSubmit(submit)}>
                <Form.Item
                    label="Category"
                    validateStatus={errors.categoryId ? "error" : ""}
                    help={errors.categoryId?.message}
                >
                    <Controller
                        name="categoryId"
                        control={control}
                        render={({ field }) => (
                            <Select
                                {...field}
                                placeholder="Select a category"
                                notFoundContent="Add a budget category to this event first"
                                options={categories.map((category) => ({ label: category.name, value: category.id }))}
                            />
                        )}
                    />
                </Form.Item>

                <Form.Item
                    label="Amount"
                    validateStatus={errors.amount ? "error" : ""}
                    help={errors.amount?.message}
                >
                    <Controller
                        name="amount"
                        control={control}
                        render={({ field }) => (
                            <InputNumber
                                {...field}
                                style={{ width: "100%" }}
                                min={0}
                                precision={2}
                                prefix="$"
                                placeholder="0.00"
                            />
                        )}
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
                        render={({ field }) => <TextArea {...field} rows={3} placeholder="What was this for?" />}
                    />
                </Form.Item>
            </form>
        </Modal>
        <Button
            onClick={() => setOpen(true)}
            icon={isEditMode ? <EditOutlined /> : <PlusOutlined />}
        >{isEditMode ? "Edit" : "Add Expense"}</Button>
    </>
}
