import { Card, Col, Row, theme, Typography } from "antd";

const { Title, Text } = Typography;

export function AttendanceTab() {
    const { token } = theme.useToken();

    return <div style={{ display: "flex", gap: "1.5em", alignItems: "flex-start" }}>
        <Card style={{ flex: "1 1 33%" }}>
            <Title level={4} style={{ marginTop: 0 }}>Check-in code</Title>
            <Text type="secondary">
                Project this at the door. Attendees scan it and fill in the attendance form - no app or account needed.
            </Text>

            <div style={{
                marginTop: "1.5em",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: 240,
                background: token.colorBgLayout,
                borderRadius: token.borderRadiusLG
            }}>
                {/* QR code */}
            </div>
        </Card>

        <div style={{ flex: "2 1 66%", display: "flex", flexDirection: "column", gap: "1.5em" }}>
            <Row gutter={16}>
                <Col span={8}>
                    <Card size="small">
                        <Text type="secondary">Checked in</Text>
                    </Card>
                </Col>
                <Col span={8}>
                    <Card size="small">
                        <Text type="secondary">Not checked in</Text>
                    </Card>
                </Col>
                <Col span={8}>
                    <Card size="small">
                        <Text type="secondary">Last scan</Text>
                    </Card>
                </Col>
            </Row>

            <Card title="Recent Check Ins">
            </Card>
        </div>
    </div>
}
