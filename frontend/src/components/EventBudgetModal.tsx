import { useEffect, useState } from "react";
import { Button, Drawer, Empty, Form, Input, InputNumber, theme } from "antd";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AxiosInstance } from "@/lib/fetcher.tsx";
import { mutate } from "swr";
import { SetEventBudgetSchema, type SetEventBudgetData, type BudgetCategory } from "@knot/backend/budget";
import { useAppNotification } from "@/lib/useAppNotification";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";

interface EventBudgetModalProps {
    eventId: number;
    categories: BudgetCategory[];
}

export function EventBudgetModal({ eventId, categories }: EventBudgetModalProps) {
    const [open, setOpen] = useState(false);
    const [api, contextHolder] = useAppNotification();
    const { token } = theme.useToken();

    const { handleSubmit, control, reset, formState: { errors } } = useForm<SetEventBudgetData>({
        resolver: zodResolver(SetEventBudgetSchema),
        defaultValues: { categories: [] }
    });

    const listError = errors.categories?.root?.message ?? errors.categories?.message;
    const { fields, append, remove } = useFieldArray({ control, name: "categories", keyName: "fieldKey" });

    useEffect(() => {
        if (!open) return;
        reset({
            categories: categories.map((category) => ({
                id: category.id,
                name: category.name,
                allocatedAmount: category.allocatedAmount
            }))
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const handleCancel = () => {
        setOpen(false);
    }

    const submit = (data: SetEventBudgetData) => {
        AxiosInstance.put(`/events/${eventId}/budget`, data)
            .then(async () => {
                await mutate(`/events/${eventId}/budget`);
                setOpen(false);
                api['success']({
                    title: "Success",
                    description: "Event budget has been updated."
                });
            })
            .catch((error) => {
                const message = error?.response?.data?.message ?? "Budget could not be updated.";
                api['error']({ title: "Error", description: message });
            });
    }

    return <>
        {contextHolder}
        <Drawer
            open={open}
            onClose={handleCancel}
            title="Edit Event Budget"
            width={480}
            footer={
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5em" }}>
                    <Button onClick={handleCancel}>Cancel</Button>
                    <Button type="primary" onClick={handleSubmit(submit)}>Save</Button>
                </div>
            }
        >
            <form onSubmit={handleSubmit(submit)}>
                {fields.length === 0 && (
                    <Empty description="No budget categories yet." image={Empty.PRESENTED_IMAGE_SIMPLE} />
                )}
                {fields.map((field, index) => {
                    const nameError = errors.categories?.[index]?.name?.message;
                    const amountError = errors.categories?.[index]?.allocatedAmount?.message;

                    return <div key={field.fieldKey} style={{ display: "flex", gap: token.marginXS, alignItems: "flex-start" }}>
                        <Form.Item
                            style={{ flex: 1 }}
                            validateStatus={nameError ? "error" : ""}
                            help={nameError}
                        >
                            <Controller
                                name={`categories.${index}.name`}
                                control={control}
                                render={({ field: inputField }) => <Input {...inputField} placeholder="e.g. Venue" />}
                            />
                        </Form.Item>
                        <Form.Item
                            style={{ width: 150 }}
                            validateStatus={amountError ? "error" : ""}
                            help={amountError}
                        >
                            <Controller
                                name={`categories.${index}.allocatedAmount`}
                                control={control}
                                render={({ field: inputField }) => (
                                    <InputNumber
                                        {...inputField}
                                        onChange={(value) => inputField.onChange(value ?? 0)}
                                        style={{ width: "100%" }}
                                        min={0}
                                        precision={2}
                                        prefix="$"
                                    />
                                )}
                            />
                        </Form.Item>
                        <Button
                            type="text"
                            danger
                            aria-label="Remove category"
                            icon={<DeleteOutlined />}
                            onClick={() => remove(index)}
                        />
                    </div>
                })}
                {listError && <Form.Item validateStatus="error" help={listError} />}
                <Button
                    type="dashed"
                    block
                    icon={<PlusOutlined />}
                    onClick={() => append({ name: "", allocatedAmount: 0 })}
                >Add Category</Button>
            </form>
        </Drawer>
        <Button icon={<EditOutlined />} onClick={() => setOpen(true)}>Edit Budget</Button>
    </>
}
