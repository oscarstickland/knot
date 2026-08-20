import {Button, Layout, Result, Space, Spin, Tag, theme, Typography, notification} from "antd";
import {useParams} from "react-router";
import useSWR, {mutate} from "swr";
import {type ClubEvent, UpdateEventSchema} from "@knot/backend/events";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {z} from "zod";
import {EventModal} from "@/components/EventModal.tsx";
import {TasksSection} from "@/components/TasksSection.tsx";
import {AxiosInstance} from "@/lib/fetcher.tsx";
import type {AxiosError} from "axios";
import {useUser} from "@/lib/auth.tsx";
import {InboxOutlined} from "@ant-design/icons";

const { Text, Title } = Typography;
dayjs.extend(relativeTime);

export function EventPage() {
    const { token } = theme.useToken();
    const { id } = useParams<{ id: string }>();

    if (!id) return <p>Unable to retrieve param</p>

    return <Layout style={{ padding: "24px 24px" }}>
        <Layout
            style={{
                padding: 24,
                background: token.colorBgContainer,
                borderRadius: token.borderRadiusLG
            }}
        >
            <EventInformation id={id} />
        </Layout>
    </Layout>
}

function EventInformation(props: { id: string }) {
    const { token } = theme.useToken();
    const user = useUser();
    const [api, contextHolder] = notification.useNotification();
    const { data, error, isLoading } = useSWR<ClubEvent, AxiosError>(props.id ? `/events/${props.id}` : null);

    if (isLoading) return <Spin />
    if (error) {
        return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: "100%" }}>
            <Result
                status="error"
                title={ error.status == 404 ? "Not Found" : "Error"}
                subTitle={ error.status === 404 ? "This event could not be found." : "Unable to fetch event."}
            />
        </div>
    }

    const start = dayjs(data.start)
    const end = dayjs(data.end)
    const isEventManager = user.role === "admin" || user.role === "exec";

    const toggleArchived = () => {
        AxiosInstance.patch(`/events/${data.id}/archive`, { archived: !data.archived })
            .then(async () => {
                await mutate(`/events/${data.id}`);
                await mutate((key) => typeof key === "string" && key.startsWith("/events?archived="));
                api["success"]({
                    title: "Success",
                    description: `Event has been ${data.archived ? "unarchived" : "archived"}.`
                });
            })
            .catch((err) => {
                const message = err?.response?.data?.message
                    ?? `Event could not be ${data.archived ? "unarchived" : "archived"}.`;
                api["error"]({ title: "Error", description: message });
            });
    }

    return <>
        {contextHolder}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
                <Space align="center" style={{ marginBottom: 8 }}>
                    <Title level={2} style={{ margin: 0 }}>{data.name}</Title>
                    { data.archived ? <Tag>Archived</Tag> : "" }
                </Space>
                <br />
                <Text style={{ color: token.colorTextSecondary }}>
                    From <strong>{start.format("dddd D MMMM YYYY [at] h:mm A")}</strong> to
                    {" "}   <strong>{end.format("dddd D MMMM YYYY [at] h:mm A")}</strong>
                </Text>
            </div>

            { isEventManager
                ? <Space>
                    <Button icon={<InboxOutlined />} onClick={toggleArchived}>
                        {data.archived ? "Unarchive" : "Archive"}
                    </Button>
                    <EventModal event={data} mode={"update"} />
                </Space>
                : ""
            }
        </div>

        <TasksSection eventId={data.id} />
    </>
}

