
import {Alert, Breadcrumb, Button, Dropdown, Input, Layout, Result, Segmented, Space, Table, type TableProps, theme, Typography} from "antd";
import {useUser} from "@/lib/auth.tsx";
import useSWR from "swr";
import type {ClubEvent} from "@knot/backend/events";
import {Link} from "react-router";
import {EventModal} from "@/components/EventModal.tsx";
import {useState} from "react";
import dayjs from "dayjs";
import {CopyOutlined, EditOutlined, MoreOutlined} from "@ant-design/icons";

const { Text, Title } = Typography;

export function EventsListPage() {
    const { token } = theme.useToken();
    const user = useUser();
    const isEventManager = user.role === "admin" || user.role === "exec";
    const [filter, setFilter] = useState<"all" | "active" | "archived">("active");
    const [search, setSearch] = useState("");

    return <Layout style={{ padding: "24px 24px" }}>
        <Layout
            style={{
                padding: "24px 24px",
                background: token.colorBgContainer,
                borderRadius: token.borderRadiusLG
            }}
        >
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: "24px"
            }}>
                <Title level={2} style={{ margin: 0 }}>Events</Title>
                { isEventManager ? <EventModal mode={"create"} /> : "" }
            </div>

            <Space style={{ paddingBottom: 24 }} wrap>
                <Input.Search
                    placeholder="Search events"
                    allowClear
                    style={{ width: 260 }}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                { isEventManager &&
                    <Segmented
                        value={filter}
                        onChange={(value) => setFilter(value as "all" | "active" | "archived")}
                        options={[
                            { label: "All", value: "all" },
                            { label: "Active", value: "active" },
                            { label: "Archived", value: "archived" }
                        ]}
                    />
                }
            </Space>

            <EventsTable filter={isEventManager ? filter : "active"} search={search} />

        </Layout>
    </Layout>
}

interface EventsTable {
    key: number;
    name: string;
    start: Date;
    end: Date;
    location: string;
    event: ClubEvent;
}

function formatEventDate(start: Date, end: Date) {
    const startDate = dayjs(start);
    const endDate = dayjs(end);

    return startDate.isSame(endDate, "day")
        ? `${startDate.format("D MMM YYYY")}, ${startDate.format("h:mma")} - ${endDate.format("h:mma")}`
        : `${startDate.format("D MMM YYYY, h:mma")} - ${endDate.format("D MMM YYYY, h:mma")}`;
}

function EventsTable(props: { filter: "all" | "active" | "archived"; search: string }) {
    const user = useUser();
    const isEventManager = user.role === "admin" || user.role === "exec";
    const archivedParam = props.filter === "active" ? "false" : props.filter === "archived" ? "true" : "all";
    const { data, isLoading, error } = useSWR<ClubEvent[]>(`/events?archived=${archivedParam}`);

    const [editingEvent, setEditingEvent] = useState<ClubEvent | null>(null);
    const [duplicatingEvent, setDuplicatingEvent] = useState<ClubEvent | null>(null);

    const columns: TableProps<EventsTable>['columns'] = [
        {
            key: "name",
            title: "Event",
            dataIndex: "name",
            sorter: (a, b) => a.name.localeCompare(b.name),
            render: (_, row) => <Link to={`/app/events/${row.key}`}>{row.name}</Link>
        },
        {
            key: "date",
            title: "Date",
            dataIndex: "start",
            sorter: (a, b) => dayjs(a.start).valueOf() - dayjs(b.start).valueOf(),
            defaultSortOrder: "ascend",
            render: (_, row) => formatEventDate(row.start, row.end)
        },
        {
            key: "location",
            title: "Location",
            dataIndex: "location"
        },
        ...(isEventManager ? [{
            key: "actions",
            title: "",
            width: 48,
            render: (_: unknown, row: EventsTable) => (
                <Dropdown
                    trigger={["click"]}
                    menu={{
                        items: [
                            { key: "edit", label: "Edit", icon: <EditOutlined /> },
                            { key: "duplicate", label: "Duplicate", icon: <CopyOutlined /> }
                        ],
                        onClick: ({ key }) => {
                            if (key === "edit") setEditingEvent(row.event);
                            if (key === "duplicate") setDuplicatingEvent(row.event);
                        }
                    }}
                >
                    <Button type="text" icon={<MoreOutlined />} />
                </Dropdown>
            )
        }] : [])
    ]

    const search = props.search.trim().toLowerCase();
    const tableData: EventsTable[] = data
        ? data
            .filter((row) => !search
                || row.name.toLowerCase().includes(search)
                || row.location.toLowerCase().includes(search))
            .map((row) => ({
                key: row.id,
                name: row.name,
                start: row.start,
                end: row.end,
                location: row.location,
                event: row
            }))
        : [];

    if (error) {
        return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: "100%" }}>
            <Result status="error" title="Retrival Error" subTitle="Unable to fetch club events." />
        </div>
    }

    const showAssignmentNotice = !isEventManager && !isLoading && data?.length === 0;

    return <>
        { showAssignmentNotice &&
            <Alert
                type="info"
                showIcon
                style={{ marginBottom: 24 }}
                message="You haven't been assigned to any events yet"
                description="You need to be assigned to an event to see it here. Speak to an executive or admin member of the club."
            />
        }
        <Table columns={columns} loading={isLoading} dataSource={tableData} />
        { editingEvent &&
            <EventModal
                mode="update"
                event={editingEvent}
                open={true}
                onOpenChange={(open) => { if (!open) setEditingEvent(null); }}
            />
        }
        { duplicatingEvent &&
            <EventModal
                mode="duplicate"
                event={duplicatingEvent}
                open={true}
                onOpenChange={(open) => { if (!open) setDuplicatingEvent(null); }}
            />
        }
    </>
}