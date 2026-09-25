import { useRef } from "react";
import { Alert, Button, Card, Col, ConfigProvider, notification, Row, Statistic, Table, theme, Typography, type TableProps } from "antd";
import { CopyOutlined, DownloadOutlined } from "@ant-design/icons";
import type { ClubEvent } from "@knot/backend/events";
import type { AttendanceCheckIn, AttendanceSummary } from "@knot/backend/event-attendance";
import QRCode from "react-qr-code";
import useSWR from "swr";
import type { AxiosError } from "axios";
import dayjs from "dayjs";

const { Title, Text } = Typography;

export function AttendanceTab(props: { event: ClubEvent }) {
    const { token } = theme.useToken();
    const [api, contextHolder] = notification.useNotification();
    const checkInUrl = `${window.location.origin}/attendance/${props.event.slug}/register`;
    const qrContainerRef = useRef<HTMLDivElement>(null);

    const { data: summary, error: summaryError, isLoading: summaryLoading } =
        useSWR<AttendanceSummary, AxiosError>(`/attendance/${props.event.id}/summary`);

    const { data: checkIns, error: checkInsError, isLoading: checkInsLoading } =
        useSWR<AttendanceCheckIn[], AxiosError>(`/attendance/${props.event.id}/check-ins`);

    const copyUrl = () => {
        navigator.clipboard.writeText(checkInUrl)
            .then(() => api["success"]({ title: "Copied", description: "Check-in link copied to clipboard." }))
            .catch(() => api["error"]({ title: "Error", description: "Unable to copy link to clipboard." }));
    }

    const downloadPng = () => {
        const svg = qrContainerRef.current?.querySelector("svg");
        if (!svg) return;

        // Upscale so the exported PNG stays crisp when dropped into slides.
        const scale = 8;
        const svgData = new XMLSerializer().serializeToString(svg);
        const svgUrl = URL.createObjectURL(new Blob([svgData], { type: "image/svg+xml;charset=utf-8" }));

        const image = new Image();
        image.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = image.width * scale;
            canvas.height = image.height * scale;

            const context = canvas.getContext("2d");
            URL.revokeObjectURL(svgUrl);
            if (!context) return;

            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);

            const link = document.createElement("a");
            link.href = canvas.toDataURL("image/png");
            link.download = `${props.event.name}-check-in-qr.png`;
            link.click();
        };
        image.onerror = () => {
            URL.revokeObjectURL(svgUrl);
            api["error"]({ title: "Error", description: "Unable to generate the QR code image." });
        };
        image.src = svgUrl;
    }

    return <div style={{ display: "flex", gap: "1.5em", alignItems: "flex-start" }}>
        {contextHolder}
        <Card style={{ flex: "1 1 33%", minWidth: 0 }}>
            <Title level={4} style={{ marginTop: 0 }}>Check-in code</Title>
            <Text type="secondary">
                Project this at the door. Attendees scan it and fill in the attendance form - no app or account needed.
            </Text>

            <div
                ref={qrContainerRef}
                style={{
                    marginTop: "1.5em",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "1.5em",
                    background: token.colorBgLayout,
                    borderRadius: token.borderRadiusLG
                }}
            >
                <QRCode value={checkInUrl} size={180} />
            </div>

            <Button
                icon={<DownloadOutlined />}
                onClick={downloadPng}
                block
                style={{ marginTop: "0.75em" }}
            >
                Download PNG
            </Button>

            <div style={{
                marginTop: "1em",
                display: "flex",
                alignItems: "center",
                gap: "0.25em",
                padding: "0.35em 0.35em 0.35em 1em",
                background: token.colorFillTertiary,
                borderRadius: 999,
                minWidth: 0
            }}>
                <Text
                    title={checkInUrl}
                    ellipsis
                    style={{ flex: 1, minWidth: 0, fontSize: token.fontSizeSM }}
                >
                    {checkInUrl}
                </Text>
                <Button type="text" shape="circle" size="small" icon={<CopyOutlined />} onClick={copyUrl} />
            </div>
        </Card>

        <div style={{ flex: "2 1 66%", display: "flex", flexDirection: "column", gap: "1.5em" }}>
            <Row gutter={16}>
                <Col span={8}>
                    <Card size="small" styles={{ body: { textAlign: "center" } }}>
                        <Statistic
                            title="Checked in"
                            loading={summaryLoading}
                            value={summaryError ? "—" : summary?.checkedIn ?? 0}
                        />
                    </Card>
                </Col>
                <Col span={8}>
                    <Card size="small" styles={{ body: { textAlign: "center" } }}>
                        <Statistic
                            title="Last Check-In"
                            loading={summaryLoading}
                            value={
                                summaryError
                                    ? "—"
                                    : summary?.lastCheckIn
                                        ? dayjs(summary.lastCheckIn).format("D MMM, h:mm A")
                                        : "-"
                            }
                        />
                    </Card>
                </Col>
            </Row>

            <Card title="Recent Check Ins" styles={{ body: { padding: checkInsError ? undefined : 0 } }}>
                {checkInsError
                    ? <Alert type="error" showIcon title="Unable to load check-ins." />
                    : <ConfigProvider theme={{ components: { Table: { headerBorderRadius: 0 } } }}>
                        <Table
                            rowKey="id"
                            loading={checkInsLoading}
                            dataSource={checkIns ?? []}
                            pagination={{
                                showSizeChanger: true,
                                pageSizeOptions: [10, 20, 50, 100],
                                defaultPageSize: 10,
                                style: { paddingInline: "1em" }
                            }}
                            columns={[
                                { key: "name", title: "Name", dataIndex: "name" },
                                { key: "email", title: "Email", dataIndex: "email" },
                                {
                                    key: "createdAt",
                                    title: "Checked in",
                                    render: (_, record) => <span>{dayjs(record.createdAt).format("D MMM, h:mm A")}</span>
                                }
                            ] as TableProps<AttendanceCheckIn>['columns']}
                        />
                    </ConfigProvider>
                }
            </Card>
        </div>
    </div>
}
