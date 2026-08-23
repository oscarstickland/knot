import { Card, Layout, theme, Typography } from "antd"
import { EventModal } from "@/components/EventModal.tsx";
import { useUser } from "@/lib/auth.tsx";
import dayjs from "dayjs";
import advancedFormat from "dayjs/plugin/advancedFormat";
import useSWR from "swr";
import type { ClubEvent } from "@knot/backend/events";
import { Link } from "react-router";
import { Listy } from 'antd';

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
            }}>
                <UpcomingTasks />
                <UpcomingEvents />
            </div>
        </Layout>
    </Layout>
}

function UpcomingTasks() {
    return <div>"upcoming tasks"</div>
}

function UpcomingEvents() {
    const events = useSWR<ClubEvent[]>(`/events?archived=false`);
    const { token } = theme.useToken();

    if (events.isLoading || events.error) {
        return <p>Error</p>
    }

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
                    <p style={{ margin: 0, color: token.colorTextTertiary }}>0/0 Tasks</p>
                </div>
            </div>
        </Link>;
    }

    return <Card title="Upcoming Events" extra={<Link to={"/app/events"}>All events</Link>} styles={{ body: { padding: "0" } }}>
        <Listy<ClubEvent> items={events.data} rowKey="id" itemRender={clubEventRenderer} style={{ margin: 0 }} styles={{  }} />
    </Card>
}