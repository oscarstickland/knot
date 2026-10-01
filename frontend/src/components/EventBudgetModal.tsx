import { useEffect, useState } from "react";
import { Button, Drawer, Empty, Form, InputNumber, theme } from "antd";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AxiosInstance } from "@/lib/fetcher.tsx";
import useSWR, { mutate } from "swr";
import { SetEventBudgetsSchema, type SetEventBudgetsData, type BudgetCategory } from "@knot/backend/budget";
import { useAppNotification } from "@/lib/useAppNotification";
import { EditOutlined } from "@ant-design/icons";

interface EventBudgetModalProps {
    eventId: number;
    currentAllocations: { categoryId: number; allocatedAmount: number }[];
}

export function EventBudgetModal({ eventId, currentAllocations }: EventBudgetModalProps) {
    const [open, setOpen] = useState(false);
    const [api, contextHolder] = useAppNotification();
    const { token } = theme.useToken();
    const { data: categories } = useSWR<BudgetCategory[]>("/budget/categories");
    const labelStyle = { fontWeight: token.fontWeightStrong };

    const { handleSubmit, control } = useForm<SetEventBudgetsData>({
        resolver: zodResolver(SetEventBudgetsSchema),
        defaultValues: { allocations: [] }
    });

    const { fields, replace } = useFieldArray({ control, name: "allocations" });

    useEffect(() => {
        if (!open || !categories) return;
        const allocationByCategory = new Map(currentAllocations.map((allocation) => [allocation.categoryId, allocation.allocatedAmount]));
        replace(categories.map((category) => ({
            categoryId: category.id,
            allocatedAmount: allocationByCategory.get(category.id) ?? 0
        })));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, categories]);

    const handleCancel = () => {
        setOpen(false);
    }

    const submit = (data: SetEventBudgetsData) => {
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
            width={420}
            footer={
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5em" }}>
                    <Button onClick={handleCancel}>Cancel</Button>
                    <Button type="primary" onClick={handleSubmit(submit)}>Save</Button>
                </div>
            }
        >
            {categories?.length === 0
                ? <Empty description="No budget categories yet. Create one in Admin Settings first." image={Empty.PRESENTED_IMAGE_SIMPLE} />
                : <form onSubmit={handleSubmit(submit)}>
                    {fields.map((field, index) => (
                        <Form.Item
                            key={field.id}
                            label={<span style={labelStyle}>{categories?.find((category) => category.id === field.categoryId)?.name}</span>}
                            layout="vertical"
                            colon={false}
                        >
                            <Controller
                                name={`allocations.${index}.allocatedAmount`}
                                control={control}
                                render={({ field: inputField }) => (
                                    <InputNumber
                                        {...inputField}
                                        style={{ width: "100%" }}
                                        min={0}
                                        precision={2}
                                        prefix="$"
                                    />
                                )}
                            />
                        </Form.Item>
                    ))}
                </form>
            }
        </Drawer>
        <Button icon={<EditOutlined />} onClick={() => setOpen(true)}>Edit Budget</Button>
    </>
}
