import { Button, Card, Progress, Typography, theme } from "antd";
import dayjs from "dayjs";
import type { OverviewAttendance } from "@knot/backend/event-overview";
import { turnoutPercent } from "@/lib/eventOverview.ts";

const { Text } = Typography;

function Fact({ label, value }: { label: string; value: string }) {
    return <div>
        <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>
        <div style={{ fontWeight: 500 }}>{value}</div>
    </div>
}

export function AttendanceCard({ attendance, onOpenAttendance }: { attendance: OverviewAttendance; onOpenAttendance: () => void }) {
    const { token } = theme.useToken();
    const { checkedIn, expected } = attendance;
    const turnout = turnoutPercent(checkedIn, expected);
    const time = (value: Date | null) => value ? dayjs(value).format("h:mma") : "—";

    return <Card
        title="Attendance"
        extra={<Button type="link" size="small" onClick={onOpenAttendance}>View check-ins</Button>}
    >
        {expected
            ? <>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <Text>Checked in</Text>
                    <Text type="secondary">{checkedIn} of {expected}</Text>
                </div>
                <Progress
                    percent={Math.min(100, turnout ?? 0)}
                    showInfo={false}
                    strokeColor={token.colorPrimary}
                    aria-label={`${turnout}% of expected attendees checked in`}
                />
            </>
            : <Text type="secondary">No expected attendance set, so turnout can't be measured.</Text>
        }
        <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
            gap: 16,
            marginTop: 16,
            paddingTop: 16,
            borderTop: `1px solid ${token.colorBorderSecondary}`
        }}>
            <Fact label="Turnout" value={turnout === null ? "—" : `${turnout}%`} />
            <Fact label="Still to arrive" value={expected ? String(Math.max(0, expected - checkedIn)) : "—"} />
            <Fact label="First check-in" value={time(attendance.firstCheckIn)} />
            <Fact label="Last check-in" value={time(attendance.lastCheckIn)} />
        </div>
    </Card>
}
