import { Alert, Avatar, Card, Empty, Skeleton, Tag, theme, Typography } from "antd";
import { LockOutlined } from "@ant-design/icons";
import useSWR from "swr";
import type { AxiosError } from "axios";
import type { EventTeamMember } from "@knot/backend/event-team";
import { useUser } from "@/lib/auth.tsx";
import { pluralise } from "@/lib/pluralise.ts";
import { ManageTeamModal } from "@/components/ManageTeamModal.tsx";

const { Text } = Typography;

export function initialsOf(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]![0] ?? "" : "")).toUpperCase() || "?";
}

export function TeamCard({ eventId, teamWide, canEdit }: { eventId: number; teamWide: boolean; canEdit: boolean }) {
    const { token } = theme.useToken();
    const user = useUser();
    const { data: team, error, isLoading } = useSWR<EventTeamMember[], AxiosError>(`/events/${eventId}/team`);

    return <Card
        title={team && team.length > 0 ? `Team · ${team.length}` : "Team"}
        extra={canEdit && team ? <ManageTeamModal eventId={eventId} teamWide={teamWide} team={team} /> : undefined}
    >
        <Text type="secondary" style={{ display: "block", marginBottom: 12, fontSize: 12 }}>
            {teamWide ? "Visible to everyone in the club" : <><LockOutlined aria-hidden /> Only the team below, admins and execs can see this event</>}
        </Text>
        {error
            ? <Alert type="error" showIcon title="Unable to load the team." />
            : isLoading || !team
                ? <Skeleton active paragraph={{ rows: 2 }} title={false} />
                : team.length === 0
                    ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={teamWide ? "No one is assigned yet." : "No members assigned. Only admins and execs can see this event."} />
                    : <ul aria-label={`${team.length} ${pluralise(team.length, "member")} assigned`} style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                        {team.map((member) => <li key={member.id} style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                            <Avatar aria-hidden style={{ background: token.colorPrimaryBg, color: token.colorPrimary, fontWeight: 600, flexShrink: 0 }}>
                                {initialsOf(member.name)}
                            </Avatar>
                            <Text ellipsis style={{ flex: 1, minWidth: 0, fontWeight: 500 }}>
                                {member.name}{member.id === user.id ? " (you)" : ""}
                            </Text>
                            {member.role !== "standard" && <Tag style={{ margin: 0, textTransform: "capitalize" }}>{member.role}</Tag>}
                        </li>)}
                    </ul>
        }
    </Card>
}
