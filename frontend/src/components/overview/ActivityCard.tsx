import { Avatar, Card, Empty, List, Typography, theme } from "antd";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import type { OverviewActivity } from "@knot/backend/event-overview";
import { describeActivity, initials } from "@/lib/eventOverview.ts";

dayjs.extend(relativeTime);

const { Text } = Typography;

export function ActivityCard({ activity }: { activity: OverviewActivity[] }) {
    const { token } = theme.useToken();

    return <Card title="Recent activity" styles={{ body: { padding: "0 24px" } }}>
        <List
            dataSource={activity}
            rowKey="key"
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No activity yet." /> }}
            renderItem={(item) => {
                const sentence = describeActivity(item);
                const actor = item.actorName ?? "Someone";
                return <List.Item style={{ paddingInline: 0, gap: 12 }}>
                    <Avatar size={28} aria-hidden style={{ background: token.colorFillSecondary, color: token.colorTextSecondary, fontSize: 12, flexShrink: 0 }}>
                        {initials(item.actorName)}
                    </Avatar>
                    <Text style={{ flex: 1, minWidth: 0 }}>
                        <Text strong>{actor}</Text>
                        {" "}<Text type="secondary">{sentence.action}</Text>
                        {" "}<Text>{sentence.subject}</Text>
                        {sentence.suffix && <>{" "}<Text type="secondary">{sentence.suffix}</Text></>}
                    </Text>
                    <Text type="secondary" style={{ whiteSpace: "nowrap", fontSize: token.fontSizeSM }} title={dayjs(item.at).format("D MMM YYYY, h:mm A")}>
                        {dayjs(item.at).fromNow()}
                    </Text>
                </List.Item>
            }}
        />
    </Card>
}
