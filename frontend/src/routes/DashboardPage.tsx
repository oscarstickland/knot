import { Avatar, Card, Layout, Table, type TableProps, theme, Tooltip, Typography } from "antd"
import { EventModal } from "@/components/EventModal.tsx";
import { useUser } from "@/lib/auth.tsx";
import dayjs from "dayjs";
import advancedFormat from "dayjs/plugin/advancedFormat";
import useSWR from "swr";
import type { ClubEvent } from "@knot/backend/events";
import { Link } from "react-router";
import { Listy } from 'antd';
import type { TaskWithRelations } from "@knot/backend/tasks";
import { TaskStatusPill } from "@/components/TaskStatusPill.tsx";

const { Text, Title } = Typography;
dayjs.extend(advancedFormat);

export function DashboardPage() {
    const { token } = theme.useToken();
    const user = useUser();
    const isEventManager = user.role === "admin" || user.role === "exec";

    const currentDate = dayjs().format("dddd, Do MMMM YYYY");
    const events = useSWR<ClubEvent[]>(`/events?archived=false`);

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
                <div>
                    <Title level={2} style={{ margin: 0 }}>Dashboard</Title>
                    <p style={{
                        margin: "1em 0em",
                        color: token.colorTextSecondary }}
                    >
                        {currentDate} { events.data ? `· ${events.data.length} active event/s` : "" }
                    </p>
                </div>

                { isEventManager ? <EventModal mode={"create"} /> : "" }
            </div>

            <div style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr",
                gap: "2em"
            }}>
                <UpcomingTasks />
                <UpcomingEvents />
            </div>
        </Layout>
    </Layout>
}

function UpcomingTasks() {
    const tasks = useSWR<TaskWithRelations[]>("/tasks/me");

    const dataVisible = tasks.data && tasks.data.length > 0;

    const EmptyTasks = () => {
        return <div style={{ display: 'flex', alignItems: "center", justifyContent: "center", height: "100%" }}>
            <p>No Upcoming Tasks</p>
        </div>
    }

    return <Card
        title="Upcoming Tasks"
        loading={tasks.isLoading}
        styles={{ body: { padding: dataVisible ? "0" : undefined } }}
    >
        { tasks.data && tasks.data.length === 0 ? <EmptyTasks /> : null }
        { tasks.data && tasks.data.length > 0 ? <UpcomingTaskList tasks={tasks.data} /> : null }
    </Card>
}

function UpcomingTaskList(props: { tasks: TaskWithRelations[] }) {
    return <Table
        rowKey="id"
        dataSource={props.tasks ?? []}
        pagination={false}
        columns={[
            {
                key: "title",
                title: "Task",
                dataIndex: "title",
            },
            {
                key: "event",
                title: "Event",
                render: (_, record) => {
                    return <span>{record.event.name}</span>;
                }
            },
            {
                key: "status",
                title: "Status",
                render: (_, record) => {
                    return <TaskStatusPill task={record} />
                }
            },
            {
                key: "due",
                title: "Due Date",
                render: (_, record) => {
                    if (record.dueDate === null) return <p>None</p>;

                    const dueDate = dayjs(record.dueDate);
                    return <p>{dueDate.format("D MMM")}</p>
                }
            }
        ] as TableProps<TaskWithRelations>['columns']}
    />
}

function UpcomingEvents() {
    const events = useSWR<ClubEvent[]>(`/events?archived=false`);
    const dataVisible = events.data && events.data.length > 0;

    const EmptyEvents = () => {
        return <div style={{ display: 'flex', alignItems: "center", justifyContent: "center", height: "100%" }}>
            <p>No Active Events</p>
        </div>
    }

    return <Card
        title="Upcoming Events"
        loading={events.isLoading}
        extra={<Link to={"/app/events"}>All events</Link>}
        styles={{ body: { padding: dataVisible ? "0" : undefined } }}
    >
        {events.data && events.data.length === 0 ? <EmptyEvents /> : null}
        {events.data && events.data.length > 0 ? <UpcomingEventsList events={events.data} /> : null}
    </Card>
}

function UpcomingEventsList(props: { events: ClubEvent[] }) {
    const { token } = theme.useToken();

    const clubEventRenderer = (event: ClubEvent) => {
        const start = dayjs(event.start);

        return <Link to={`/app/events/${event.id}`} key={event.id}>
            <div style={{ display: "flex", userSelect: "none", gap: "1em", color: "black" }}>
                <div style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center"
                }}>
                    <div style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        background: token.colorBgSpotlight,
                        color: token.colorTextLightSolid,
                        width: "4.5em",
                        height: "4.5em",
                        borderRadius: token.borderRadiusLG
                    }}>
                        <p style={{ margin: 0, fontSize: token.fontSizeXL, fontWeight: token.fontWeightStrong }}>
                            { start.format("DD")}
                        </p>
                        <p style={{ margin: 0 }}>
                            { start.format("MMM")}
                        </p>
                    </div>
                </div>

                <div style={{
                    display: "flex",
                    flexDirection: "column",
                }}>
                    <p style={{ margin: 0, fontSize: token.fontSizeHeading4, fontWeight: token.fontWeightStrong }}>{event.name}</p>
                    <p style={{ margin: 0, color: token.colorTextSecondary }}>Location · { start.format("H:mm A") }</p>
                    <p style={{ margin: 0, color: token.colorTextTertiary }}>?/? Tasks</p>
                </div>
            </div>
        </Link>;
    }

    return <Listy<ClubEvent> items={props.events} rowKey="id" itemRender={clubEventRenderer} style={{ margin: 0 }} styles={{  }} />;
}