import { Empty, Result, Space, Statistic, Table, Tag, Typography, theme, type TableProps } from "antd";
import useSWR from "swr";
import dayjs from "dayjs";
import type { EventBudgetLine, EventBudgetView, ExpenseWithRelations, IncomeWithCreator } from "@knot/backend/budget";
import { useUser } from "@/lib/auth.tsx";
import { EventBudgetModal } from "@/components/EventBudgetModal.tsx";
import { ExpenseModal } from "@/components/ExpenseModal.tsx";
import { IncomeModal } from "@/components/IncomeModal.tsx";
import { formatCurrency as currency, netPosition } from "@/lib/currency.ts";
import { ReimbursementControl } from "@/components/ReimbursementControl.tsx";

const { Text } = Typography;

export function BudgetSection(props: { eventId: number }) {
    const { token } = theme.useToken();
    const user = useUser();
    const isBudgetManager = user.role === "admin" || user.role === "exec";
    const { data, isLoading, error } = useSWR<EventBudgetView>(`/events/${props.eventId}/budget`);

    if (error) {
        return <Result status="error" title="Retrieval Error" subTitle="Unable to fetch budget." />
    }

    // Standard members get a reduced view: just the expenses they logged themselves.
    const summary = data?.scope === "full" ? data : undefined;
    const categories = summary?.categories ?? [];
    const expenses = data?.expenses ?? [];
    const totalAllocated = summary?.totalAllocated ?? 0;
    const totalSpent = summary?.totalSpent ?? 0;
    const totalOwed = summary?.totalOwed ?? 0;
    const remaining = totalAllocated - totalSpent;
    const income = summary?.income ?? [];
    const totalIncome = summary?.totalIncome ?? 0;
    const net = netPosition(totalIncome, totalSpent);

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
        ...(isBudgetManager ? [{
            key: "addedBy",
            title: "Added By",
            render: (_: unknown, expense: ExpenseWithRelations) => expense.creator.name
        }] : []),
        {
            key: "reimbursement",
            title: "Reimbursement",
            render: (_, expense) => (
                <ReimbursementControl eventId={props.eventId} expense={expense} canManage={isBudgetManager} />
            )
        },
        {
            key: "actions",
            title: "",
            render: (_, expense) => (
                <ExpenseModal mode="update" eventId={props.eventId} expense={expense} />
            )
        }
    ];

    const incomeColumns: TableProps<IncomeWithCreator>['columns'] = [
        {
            key: "date",
            title: "Date",
            render: (_, entry) => dayjs(entry.createdAt).format("D MMM YYYY")
        },
        {
            key: "source",
            title: "Source",
            dataIndex: "source"
        },
        {
            key: "notes",
            title: "Notes",
            render: (_, entry) => entry.description ?? <Text type="secondary">—</Text>
        },
        {
            key: "amount",
            title: "Amount",
            render: (_, entry) => <Text style={{ color: token.colorSuccess }}>+{currency(entry.amount)}</Text>
        },
        {
            key: "addedBy",
            title: "Added By",
            render: (_, entry) => entry.creator.name
        },
        {
            key: "actions",
            title: "",
            render: (_, entry) => (
                <IncomeModal mode="update" eventId={props.eventId} income={entry} />
            )
        }
    ];

    const expensesTable = <>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <Text strong>{isBudgetManager ? "Expenses" : "My Expenses"}</Text>
            <ExpenseModal mode="create" eventId={props.eventId} />
        </div>
        <Table
            rowKey="id"
            loading={isLoading}
            columns={expenseColumns}
            dataSource={expenses}
            pagination={false}
            locale={{ emptyText: <Empty description="No expenses logged yet" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        />
    </>;

    if (!isBudgetManager) {
        return <div>{expensesTable}</div>
    }

    return <div>
        <Space size="large" style={{ marginBottom: "24px" }}>
            <Statistic title="Total Allocated" value={totalAllocated} precision={2} prefix="$" />
            <Statistic title="Total Spent" value={totalSpent} precision={2} prefix="$" />
            <Statistic title="Total Income" value={totalIncome} precision={2} prefix="$" />
            <Statistic
                title="Net (Income − Spent)"
                value={net}
                precision={2}
                prefix="$"
                valueStyle={{ color: net < 0 ? token.colorError : token.colorSuccess }}
            />
            <Statistic
                title="Owed to Members"
                value={totalOwed}
                precision={2}
                prefix="$"
                valueStyle={{ color: totalOwed > 0 ? token.colorWarning : undefined }}
            />
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
            <EventBudgetModal eventId={props.eventId} categories={categories} />
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
            <Text strong>Income</Text>
            <IncomeModal mode="create" eventId={props.eventId} />
        </div>
        <Table
            rowKey="id"
            loading={isLoading}
            columns={incomeColumns}
            dataSource={income}
            pagination={false}
            locale={{ emptyText: <Empty description="No income recorded yet" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
            style={{ marginBottom: "32px" }}
        />

        {expensesTable}
    </div>
}
