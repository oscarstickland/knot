import {Breadcrumb, Button, Dropdown, Layout, Result, Table, Tabs, type TableProps, theme, Typography} from "antd";
import {useUser} from "@/lib/auth.tsx";
import useSWR from "swr";
import type {ClubEvent} from "@knot/backend/events";
import {Link} from "react-router";
import {EventModal} from "@/components/EventModal.tsx";
import {useState} from "react";
import dayjs from "dayjs";
import {MoreOutlined} from "@ant-design/icons";

const { Text, Title } = Typography;

export function EventsListPage() {
    const { token } = theme.useToken();
    const user = useUser();
    const isEventManager = user.role === "admin" || user.role === "exec";
    const [showArchived, setShowArchived] = useState(false);

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

            { isEventManager
                ? <Tabs
                    activeKey={showArchived ? "archived" : "active"}
                    onChange={(key) => setShowArchived(key === "archived")}
                    items={[
                        { key: "active", label: "Active" },
                        { key: "archived", label: "Archived" }
                    ]}
                />
                : ""
            }

            <EventsTable archived={showArchived} />

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

function EventsTable(props: { archived: boolean }) {
    const user = useUser();
    const isEventManager = user.role === "admin" || user.role === "exec";
    const { data, isLoading, error } = useSWR<ClubEvent[]>(`/events?archived=${props.archived}`);
    const [editingEvent, setEditingEvent] = useState<ClubEvent | null>(null);

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
                        items: [{ key: "edit", label: "Edit" }],
                        onClick: ({ key }) => {
                            if (key === "edit") setEditingEvent(row.event);
                        }
                    }}
                >
                    <Button type="text" icon={<MoreOutlined />} />
                </Dropdown>
            )
        }] : [])
    ]

    const tableData: EventsTable[] = data
        ? data.map((row) => ({
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

    return <>
        <Table columns={columns} loading={isLoading} dataSource={tableData} />
        { editingEvent &&
            <EventModal
                mode="update"
                event={editingEvent}
                open={true}
                onOpenChange={(open) => { if (!open) setEditingEvent(null); }}
            />
        }
    </>
}