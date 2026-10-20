import { Card, Descriptions } from "antd";
import dayjs from "dayjs";
import type { ReactNode } from "react";
import type { ClubEvent } from "@knot/backend/events";

export function EventDetailsCard({ event, extra }: { event: ClubEvent; extra?: ReactNode }) {
    const start = dayjs(event.start);
    const end = dayjs(event.end);
    const sameDay = start.isSame(end, "day");

    return <Card title="Event details" extra={extra}>
        <Descriptions column={1} size="small" colon={false} styles={{ label: { width: 96 } }}>
            <Descriptions.Item label="Date">
                {sameDay ? start.format("ddd D MMM YYYY") : `${start.format("ddd D MMM")} – ${end.format("ddd D MMM YYYY")}`}
            </Descriptions.Item>
            <Descriptions.Item label="Time">
                {sameDay
                    ? `${start.format("h:mma")} – ${end.format("h:mma")}`
                    : `${start.format("h:mma")} – ${end.format("D MMM, h:mma")}`}
            </Descriptions.Item>
            <Descriptions.Item label="Location">{event.location}</Descriptions.Item>
            <Descriptions.Item label="Expected">
                {event.expectedAttendees ? `${event.expectedAttendees} attendees` : "Not set"}
            </Descriptions.Item>
        </Descriptions>
    </Card>
}
