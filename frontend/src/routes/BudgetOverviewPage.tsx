import { Empty, Layout, Progress, Result, Space, Table, Tag, Typography, theme, type TableProps } from "antd";
import useSWR from "swr";
import dayjs from "dayjs";
import { Link } from "react-router";
import type { EventSpending } from "@knot/backend/budget";

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
            <SpendingByEvent />
        </Layout>
    </Layout>
}

function SpendingByEvent() {
    const { data, isLoading, error } = useSWR<EventSpending[]>("/budget/spending");

    if (error) {
        return <Result status="error" title="Retrieval Error" subTitle="Unable to fetch spending data." />
    }

    const columns: TableProps<EventSpending>['columns'] = [
        {
            key: "name",
            title: "Event",
            sorter: (a, b) => a.name.localeCompare(b.name),
            render: (_, event) => <Space>
                <Link to={`/app/events/${event.eventId}`}>{event.name}</Link>
                {event.archived && <Tag>Archived</Tag>}
            </Space>
        },
        {
            key: "date",
            title: "Date",
            sorter: (a, b) => dayjs(a.start).valueOf() - dayjs(b.start).valueOf(),
            render: (_, event) => dayjs(event.start).format("D MMM YYYY")
        },
        {
            key: "allocated",
            title: "Allocated",
            sorter: (a, b) => a.totalAllocated - b.totalAllocated,
            render: (_, event) => currency(event.totalAllocated)
        },
        {
            key: "spent",
            title: "Spent",
            sorter: (a, b) => a.totalSpent - b.totalSpent,
            render: (_, event) => currency(event.totalSpent)
        },
        {
            key: "progress",
            title: "% Used",
            render: (_, event) => {
                const percent = event.totalAllocated > 0
                    ? Math.round((event.totalSpent / event.totalAllocated) * 100)
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
        rowKey="eventId"
        loading={isLoading}
        columns={columns}
        dataSource={data ?? []}
        pagination={false}
        locale={{
            emptyText: <Empty
                description="No event budgets yet. Add budget categories from an event's Budget tab to start tracking spending."
                image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
        }}
    />
}
