import { useState } from "react";
import { Button, Form, Input, InputNumber, Modal, Popconfirm } from "antd";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AxiosInstance } from "@/lib/fetcher.tsx";
import { mutate } from "swr";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { CreateIncomeSchema, type CreateIncomeData, type IncomeWithCreator } from "@knot/backend/budget";
import { useAppNotification } from "@/lib/useAppNotification";

const { TextArea } = Input;

type IncomeModalProps =
    | { mode: "create"; eventId: number; income?: never }
    | { mode: "update"; eventId: number; income: IncomeWithCreator };

export function IncomeModal({ mode, eventId, income }: IncomeModalProps) {
    const [open, setOpen] = useState(false);
    const [api, contextHolder] = useAppNotification();
    const isEditMode = mode === "update";

    const { handleSubmit, formState: { errors }, control, reset } = useForm<CreateIncomeData>({
        resolver: zodResolver(CreateIncomeSchema),
        defaultValues: isEditMode ? {
            source: income.source,
            amount: income.amount,
            description: income.description ?? ""
        } : {
            source: "",
            amount: undefined,
            description: ""
        }
    });

    const handleCancel = () => {
        setOpen(false);
        reset();
    }

    const submit = (data: CreateIncomeData) => {
        const request = isEditMode
            ? AxiosInstance.put(`/budget/income/${income.id}`, data)
            : AxiosInstance.post(`/events/${eventId}/income`, data);

        request.then(async () => {
            await mutate(`/events/${eventId}/budget`);
            setOpen(false);
            if (!isEditMode) reset();
            api['success']({
                title: "Success",
                description: `Income has been ${isEditMode ? "updated" : "recorded"}.`
            });
        })
        .catch((error) => {
            const message = error?.response?.data?.message
                ?? `Income could not be ${isEditMode ? "updated" : "recorded"}.`;
            api['error']({ title: "Error", description: message });
        });
    }

    const deleteIncome = () => {
        if (!isEditMode) return;

        AxiosInstance.delete(`/budget/income/${income.id}`)
            .then(async () => {
                await mutate(`/events/${eventId}/budget`);
                setOpen(false);
                api['success']({
                    title: "Success",
                    description: "Income has been deleted."
                });
            })
            .catch((error) => {
                const message = error?.response?.data?.message ?? "Income could not be deleted.";
                api['error']({ title: "Error", description: message });
            });
    }

    return <>
        {contextHolder}
        <Modal
            open={open}
            onOk={handleSubmit(submit)}
            onCancel={handleCancel}
            title={`${isEditMode ? "Edit" : "Record"} Income`}
            centered
            footer={isEditMode ? (_, { OkBtn, CancelBtn }) => (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <Popconfirm
                        title="Delete income"
                        description="Are you sure you want to delete this income?"
                        onConfirm={deleteIncome}
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
                    label="Source"
                    validateStatus={errors.source ? "error" : ""}
                    help={errors.source?.message}
                >
                    <Controller
                        name="source"
                        control={control}
                        render={({ field }) => <Input {...field} placeholder="e.g. Student union grant" />}
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
                    label="Notes"
                    validateStatus={errors.description ? "error" : ""}
                    help={errors.description?.message}
                >
                    <Controller
                        name="description"
                        control={control}
                        render={({ field }) => <TextArea {...field} rows={3} placeholder="Optional details" />}
                    />
                </Form.Item>
            </form>
        </Modal>
        <Button
            onClick={() => setOpen(true)}
            icon={isEditMode ? <EditOutlined /> : <PlusOutlined />}
        >{isEditMode ? "Edit" : "Add Income"}</Button>
    </>
}
