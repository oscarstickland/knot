import { Empty, Result, Space, Statistic, Table, Tag, Typography, theme, type TableProps } from "antd";
import useSWR from "swr";
import dayjs from "dayjs";
import type { EventBudgetLine, EventBudgetSummary, ExpenseWithRelations } from "@knot/backend/budget";
import { useUser } from "@/lib/auth.tsx";
import { EventBudgetModal } from "@/components/EventBudgetModal.tsx";
import { ExpenseModal } from "@/components/ExpenseModal.tsx";

const { Text } = Typography;

const currency = (amount: number) => `$${amount.toFixed(2)}`;

export function BudgetSection(props: { eventId: number }) {
    const { token } = theme.useToken();
    const user = useUser();
    const isBudgetManager = user.role === "admin" || user.role === "exec";
    const { data, isLoading, error } = useSWR<EventBudgetSummary>(`/events/${props.eventId}/budget`);

    if (error) {
        return <Result status="error" title="Retrieval Error" subTitle="Unable to fetch budget." />
    }

    const categories = data?.categories ?? [];
    const expenses = data?.expenses ?? [];
    const totalAllocated = data?.totalAllocated ?? 0;
    const totalSpent = data?.totalSpent ?? 0;
    const remaining = totalAllocated - totalSpent;

    const categoryColumns: TableProps<EventBudgetLine>['columns'] = [
        {
            key: "category",
            title: "Category",
            dataIndex: "name"
        },
        {
            key: "allocated",
            title: "Allocated",
            render: (_, line) => currency(line.allocatedAmount)
        },
        {
            key: "spent",
            title: "Spent",
            render: (_, line) => currency(line.spent)
        },
        {
            key: "remaining",
            title: "Remaining",
            render: (_, line) => currency(line.allocatedAmount - line.spent)
        },
        {
            key: "status",
            title: "Status",
            render: (_, line) => line.spent > line.allocatedAmount
                ? <Tag color="red">Over Budget</Tag>
                : <Tag color="green">Under Budget</Tag>
        }
    ];

    const expenseColumns: TableProps<ExpenseWithRelations>['columns'] = [
        {
            key: "date",
            title: "Date",
            render: (_, expense) => dayjs(expense.createdAt).format("D MMM YYYY")
        },
        {
            key: "category",
            title: "Category",
            render: (_, expense) => expense.category.name
        },
        {
            key: "description",
            title: "Description",
            dataIndex: "description"
        },
        {
            key: "amount",
            title: "Amount",
            render: (_, expense) => currency(expense.amount)
        },
        {
            key: "addedBy",
            title: "Added By",
            render: (_, expense) => expense.creator.name
        },
        ...(isBudgetManager ? [{
            key: "actions",
            title: "",
            render: (_: unknown, expense: ExpenseWithRelations) => (
                <ExpenseModal mode="update" eventId={props.eventId} expense={expense} />
            )
        }] : [])
    ];

    return <div>
        <Space size="large" style={{ marginBottom: "24px" }}>
            <Statistic title="Total Allocated" value={totalAllocated} precision={2} prefix="$" />
            <Statistic title="Total Spent" value={totalSpent} precision={2} prefix="$" />
            <Statistic
                title="Remaining"
                value={remaining}
                precision={2}
                prefix="$"
                valueStyle={{ color: remaining < 0 ? token.colorError : token.colorSuccess }}
            />
        </Space>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <Text strong>Category Budgets</Text>
            {isBudgetManager && (
                <EventBudgetModal eventId={props.eventId} categories={categories} />
            )}
        </div>
        <Table
            rowKey="id"
            loading={isLoading}
            columns={categoryColumns}
            dataSource={categories}
            pagination={false}
            locale={{ emptyText: <Empty description="No budget categories yet" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
            style={{ marginBottom: "32px" }}
        />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <Text strong>Expenses</Text>
            {isBudgetManager && <ExpenseModal mode="create" eventId={props.eventId} />}
        </div>
        <Table
            rowKey="id"
            loading={isLoading}
            columns={expenseColumns}
            dataSource={expenses}
            pagination={false}
            locale={{ emptyText: <Empty description="No expenses logged yet" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        />
    </div>
}
