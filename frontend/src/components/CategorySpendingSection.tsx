import { Empty, Progress, Result, Space, Table, Tag, theme, type TableProps } from "antd";
import useSWR from "swr";
import dayjs from "dayjs";
import { Link } from "react-router";
import type { CategorySpending, CategorySpendingEvent, CategorySpendingSummary } from "@knot/backend/budget";
import { formatCurrency, percentUsed, spendShares, type SpendShare } from "@/lib/categorySpending.ts";
import { ShareDot, shareColour, SpendShareStrip } from "@/components/SpendShareStrip.tsx";

export type DateRange = { from: string; to: string } | null;

function spendingUrl(range: DateRange): string {
    if (!range) return "/budget/categories";

    const params = new URLSearchParams({
        from: dayjs(range.from).startOf("day").toISOString(),
        to: dayjs(range.to).endOf("day").toISOString()
    });
    return `/budget/categories?${params}`;
}

function UsedCell({ spent, allocated }: { spent: number; allocated: number }) {
    const percent = percentUsed(spent, allocated);
    if (percent === null) return <Tag>Unbudgeted</Tag>;

    return <Progress
        percent={percent}
        status={percent > 100 ? "exception" : "normal"}
        // Show the real figure when over budget, instead of antd's default cross icon.
        format={() => `${percent}%`}
        style={{ maxWidth: 240, minWidth: 120 }}
    />
}

export function CategorySpendingSection({ range }: { range: DateRange }) {
    const { data, isLoading, error } = useSWR<CategorySpendingSummary>(spendingUrl(range));

    if (error) {
        return <Result status="error" title="Retrieval Error" subTitle="Unable to fetch category spending." />
    }

    const categories = data?.categories ?? [];
    const shares = spendShares(categories);

    return <>
        {data && categories.length > 0 && <SpendShareStrip
            shares={shares}
            totalSpent={data.totalSpent}
            totalAllocated={data.totalAllocated}
            categoryCount={categories.length}
        />}
        <CategoryTable categories={categories} shares={shares} loading={isLoading} filtered={range !== null} />
    </>
}

interface CategoryTableProps {
    categories: CategorySpending[];
    shares: SpendShare[];
    loading: boolean;
    filtered: boolean;
}

function CategoryTable({ categories, shares, loading, filtered }: CategoryTableProps) {
    const { token } = theme.useToken();

    const columns: TableProps<CategorySpending>['columns'] = [
        {
            key: "name",
            title: "Category",
            sorter: (a, b) => a.name.localeCompare(b.name),
            render: (_, category) => <Space size={8}>
                <ShareDot colour={shareColour(token, shares, category.key)} />
                {category.name}
            </Space>
        },
        {
            key: "events",
            title: "Events",
            sorter: (a, b) => a.events.length - b.events.length,
            render: (_, category) => category.events.length
        },
        {
            key: "allocated",
            title: "Allocated",
            sorter: (a, b) => a.totalAllocated - b.totalAllocated,
            render: (_, category) => formatCurrency(category.totalAllocated)
        },
        {
            key: "spent",
            title: "Spent",
            defaultSortOrder: "descend",
            sorter: (a, b) => a.totalSpent - b.totalSpent,
            render: (_, category) => formatCurrency(category.totalSpent)
        },
        {
            key: "progress",
            title: "% Used",
            render: (_, category) => <UsedCell spent={category.totalSpent} allocated={category.totalAllocated} />
        }
    ];

    const emptyText = filtered
        ? "No spending in this date range. Try a wider range."
        : "No categories yet. Add budget categories from an event's Budget tab to start tracking spending.";

    return <Table
        rowKey="key"
        loading={loading}
        columns={columns}
        dataSource={categories}
        pagination={false}
        scroll={{ x: "max-content" }}
        expandable={{ expandedRowRender: (category) => <CategoryEventsTable events={category.events} /> }}
        locale={{ emptyText: <Empty description={emptyText} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
    />
}

function CategoryEventsTable({ events }: { events: CategorySpendingEvent[] }) {
    const columns: TableProps<CategorySpendingEvent>['columns'] = [
        {
            key: "name",
            title: "Event",
            render: (_, event) => <Link to={`/app/events/${event.eventId}`}>{event.name}</Link>
        },
        {
            key: "date",
            title: "Date",
            render: (_, event) => dayjs(event.start).format("D MMM YYYY")
        },
        {
            key: "allocated",
            title: "Allocated",
            render: (_, event) => formatCurrency(event.allocated)
        },
        {
            key: "spent",
            title: "Spent",
            render: (_, event) => formatCurrency(event.spent)
        },
        {
            key: "progress",
            title: "% Used",
            render: (_, event) => <UsedCell spent={event.spent} allocated={event.allocated} />
        }
    ];

    return <Table rowKey="eventId" size="small" columns={columns} dataSource={events} pagination={false} />
}
