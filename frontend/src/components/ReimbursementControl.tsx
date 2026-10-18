import { Button, Popconfirm, Space, Tag, Tooltip } from "antd";
import { CheckOutlined, UndoOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { mutate } from "swr";
import type { ExpenseWithRelations } from "@knot/backend/budget";
import { AxiosInstance } from "@/lib/fetcher.tsx";
import { useAppNotification } from "@/lib/useAppNotification";

type ReimbursementControlProps = {
    eventId: number;
    expense: ExpenseWithRelations;
    canManage: boolean;
};

export function ReimbursementControl({ eventId, expense, canManage }: ReimbursementControlProps) {
    const [api, contextHolder] = useAppNotification();

    if (!expense.paidPersonally) return null;

    const isReimbursed = expense.reimbursedAt !== null;

    const setReimbursed = (reimbursed: boolean) => {
        AxiosInstance.patch(`/budget/expenses/${expense.id}/reimbursement`, { reimbursed })
            .then(async () => {
                await mutate(`/events/${eventId}/budget`);
                api['success']({
                    title: "Success",
                    description: reimbursed ? "Expense marked as reimbursed." : "Reimbursement undone."
                });
            })
            .catch((error) => {
                const message = error?.response?.data?.message ?? "Reimbursement could not be updated.";
                api['error']({ title: "Error", description: message });
            });
    };

    const status = isReimbursed
        ? <Tooltip title={`Reimbursed ${dayjs(expense.reimbursedAt).format("D MMM YYYY")}`}>
            <Tag color="green">Reimbursed</Tag>
        </Tooltip>
        : <Tag color="orange">Owed to {expense.creator.name}</Tag>;

    return <Space size="small">
        {contextHolder}
        {status}
        {canManage && (isReimbursed
            ? <Popconfirm
                title="Undo reimbursement"
                description="Mark this expense as not yet reimbursed?"
                onConfirm={() => setReimbursed(false)}
                okText="Undo"
            >
                <Button size="small" icon={<UndoOutlined />}>Undo</Button>
            </Popconfirm>
            : <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => setReimbursed(true)}>
                Mark Reimbursed
            </Button>)}
    </Space>
}
