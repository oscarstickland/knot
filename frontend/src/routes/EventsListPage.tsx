import {Breadcrumb, Button, Layout, Result, Table, Tabs, type TableProps, theme, Typography} from "antd";
import {useUser} from "@/lib/auth.tsx";
import useSWR from "swr";
import type {ClubEvent} from "@knot/backend/events";
import {Link} from "react-router";
import {EventModal} from "@/components/EventModal.tsx";
import {useState} from "react";

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
}

function EventsTable(props: { archived: boolean }) {
    const { data, isLoading, error } = useSWR<ClubEvent[]>(`/events?archived=${props.archived}`);
    const columns: TableProps<EventsTable>['columns'] = [
        {
            key: "name",
            title: "Event",
            dataIndex: "name",
            render: (_, row) => <Link to={`/app/events/${row.key}`}>{row.name}</Link>
        }
    ]

    const tableData: EventsTable[] = data
        ? data.map((row) => ({
            key: row.id,
            name: row.name
        }))
        : [];

    if (error) {
        return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: "100%" }}>
            <Result status="error" title="Retrival Error" subTitle="Unable to fetch club events." />
        </div>
    }

    return <Table columns={columns} loading={isLoading} dataSource={tableData} />
}