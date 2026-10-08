import { DatePicker, Empty, Layout, Progress, Result, Segmented, Space, Table, Tag, Typography, theme, type TableProps } from "antd";
import useSWR from "swr";
import dayjs from "dayjs";
import { Link, useSearchParams } from "react-router";
import type { EventSpending } from "@knot/backend/budget";
import { formatCurrency } from "@/lib/categorySpending.ts";
import { CategorySpendingSection, type DateRange } from "@/components/CategorySpendingSection.tsx";

const { Title } = Typography;
const { RangePicker } = DatePicker;

type BudgetView = "events" | "categories";
const URL_DATE_FORMAT = "YYYY-MM-DD";

// View and date range live in the URL so a filtered view can be shared or bookmarked.
function useBudgetFilters() {
    const [params, setParams] = useSearchParams();
    const view: BudgetView = params.get("view") === "categories" ? "categories" : "events";
    const from = params.get("from");
    const to = params.get("to");
    const range: DateRange = from && to && dayjs(from).isValid() && dayjs(to).isValid() ? { from, to } : null;

    const update = (changes: Record<string, string | null>) => {
        const next = new URLSearchParams(params);
        Object.entries(changes).forEach(([key, value]) => value === null ? next.delete(key) : next.set(key, value));
        setParams(next, { replace: true });
    };

    return {
        view,
        range,
        setView: (value: BudgetView) => update({ view: value === "events" ? null : value }),
        setRange: (value: DateRange) => update({ from: value?.from ?? null, to: value?.to ?? null })
    };
}

export function BudgetOverviewPage() {
    const { token } = theme.useToken();
    const { view, range, setView, setRange } = useBudgetFilters();

    return <Layout style={{ padding: "24px 24px" }}>
        <Layout
            style={{
                padding: "24px 24px",
                background: token.colorBgContainer,
                borderRadius: token.borderRadiusLG
            }}
        >
            <Title level={2} style={{ margin: 0, marginBottom: "24px" }}>Budget Overview</Title>

            <Space style={{ paddingBottom: 24 }} wrap>
                <Segmented
                    value={view}
                    onChange={(value) => setView(value as BudgetView)}
                    options={[
                        { label: "By event", value: "events" },
                        { label: "By category", value: "categories" }
                    ]}
                />
                { view === "categories" &&
                    <RangePicker
                        aria-label="Event date range"
                        allowEmpty={[false, false]}
                        value={range ? [dayjs(range.from), dayjs(range.to)] : null}
                        onChange={(dates) => setRange(dates?.[0] && dates[1]
                            ? { from: dates[0].format(URL_DATE_FORMAT), to: dates[1].format(URL_DATE_FORMAT) }
                            : null
                        )}
                    />
                }
            </Space>

            { view === "categories" ? <CategorySpendingSection range={range} /> : <SpendingByEvent /> }
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
            render: (_, event) => formatCurrency(event.totalAllocated)
        },
        {
            key: "spent",
            title: "Spent",
            sorter: (a, b) => a.totalSpent - b.totalSpent,
            render: (_, event) => formatCurrency(event.totalSpent)
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
