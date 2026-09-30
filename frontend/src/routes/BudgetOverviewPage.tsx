import { Empty, Layout, Progress, Result, Table, Typography, theme, type TableProps } from "antd";
import useSWR from "swr";
import type { CategorySpending } from "@knot/backend/budget";

const { Title } = Typography;

const currency = (amount: number) => `$${amount.toFixed(2)}`;

export function BudgetOverviewPage() {
    const { token } = theme.useToken();

    return <Layout style={{ padding: "24px 24px" }}>
        <Layout
            style={{
                padding: "24px 24px",
                background: token.colorBgContainer,
                borderRadius: token.borderRadiusLG
            }}
        >
            <Title level={2} style={{ margin: 0, marginBottom: "24px" }}>Budget Overview</Title>
            <SpendingByCategory />
        </Layout>
    </Layout>
}

function SpendingByCategory() {
    const { data, isLoading, error } = useSWR<CategorySpending[]>("/budget/spending");

    if (error) {
        return <Result status="error" title="Retrieval Error" subTitle="Unable to fetch spending data." />
    }

    const columns: TableProps<CategorySpending>['columns'] = [
        {
            key: "name",
            title: "Category",
            dataIndex: "name",
            sorter: (a, b) => a.name.localeCompare(b.name)
        },
        {
            key: "allocated",
            title: "Total Allocated",
            render: (_, category) => currency(category.totalAllocated)
        },
        {
            key: "spent",
            title: "Total Spent",
            render: (_, category) => currency(category.totalSpent)
        },
        {
            key: "progress",
            title: "% Used",
            render: (_, category) => {
                const percent = category.totalAllocated > 0
                    ? Math.round((category.totalSpent / category.totalAllocated) * 100)
                    : 0;

                return <Progress
                    percent={percent}
                    status={percent > 100 ? "exception" : "normal"}
                    style={{ maxWidth: 240 }}
                />
            }
        }
    ];

    return <Table
        rowKey="categoryId"
        loading={isLoading}
        columns={columns}
        dataSource={data ?? []}
        pagination={false}
        locale={{
            emptyText: <Empty
                description="No budget categories yet. Create one in Admin Settings to start tracking spending."
                image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
        }}
    />
}
