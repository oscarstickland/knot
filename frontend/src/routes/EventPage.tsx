import {Layout, Result, Spin, theme, Typography} from "antd";
import {useParams} from "react-router";
import useSWR from "swr";
import {type ClubEvent, UpdateEventSchema} from "@knot/backend/events";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {z} from "zod";
import {EventModal} from "@/components/EventModal.tsx";
import type {AxiosError} from "axios";

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

    return <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
            <Title level={2} style={{ marginTop: '0' }}>{data.name}</Title>
            <Text style={{ color: token.colorTextSecondary }}>
                From <strong>{start.format("dddd D MMMM YYYY [at] h:mm A")}</strong> to
                {" "}   <strong>{end.format("dddd D MMMM YYYY [at] h:mm A")}</strong>
            </Text>
        </div>

        <EventModal event={data} mode={"update"} />
    </div>
}

