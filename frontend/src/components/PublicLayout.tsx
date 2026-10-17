import { Grid, theme, Typography } from "antd";
import { BankOutlined, CalendarOutlined, QrcodeOutlined } from "@ant-design/icons";
import React from "react";
import { Link } from "react-router";
import { KnotLogo } from "./KnotLogo.tsx";
import { SupportedByMonashAutomation } from "./SupportedByMonashAutomation.tsx";

const { Title, Text } = Typography;

const PANEL_WIDTH = 440;
const PANEL_GUTTER = 40;
const MOBILE_GUTTER = 24;

const FEATURES = [
    {
        icon: <CalendarOutlined />,
        title: "Events and tasks",
        description: "Plan each event, split the work into tasks and see what's blocking what."
    },
    {
        icon: <BankOutlined />,
        title: "Budgeting",
        description: "Set budgets per event and track expenses as they come in."
    },
    {
        icon: <QrcodeOutlined />,
        title: "Attendance",
        description: "Open check-in with a QR code and see who turned up."
    }
];

// Mirrors the AppShell sidebar: a white panel with the brand up top and the supporter pinned to the bottom.
export function PublicLayout(props: { children: React.ReactNode }) {
    const { token } = theme.useToken();
    const screens = Grid.useBreakpoint();
    const showFeatures = screens.lg ?? false;
    const gutter = screens.sm ? PANEL_GUTTER : MOBILE_GUTTER;

    return <div style={{ display: "flex", minHeight: "100vh", background: token.colorBgLayout }}>
        <main style={{
            display: "flex",
            flexDirection: "column",
            width: showFeatures ? PANEL_WIDTH : "100%",
            flexShrink: 0,
            background: token.colorBgContainer,
            borderRight: showFeatures ? `1px solid ${token.colorBorderSecondary}` : "none"
        }}>
            <header style={{ padding: `24px ${gutter}px` }}>
                <Link to="/" aria-label="Knot home" style={{ display: "inline-block", color: "inherit", textDecoration: "none" }}>
                    <KnotLogo />
                </Link>
            </header>

            <div style={{
                flexGrow: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                padding: `24px ${gutter}px 48px`,
                maxWidth: PANEL_WIDTH,
                width: "100%",
                boxSizing: "border-box",
                margin: "0 auto"
            }}>
                {props.children}
            </div>

            <footer style={{ borderTop: `1px solid ${token.colorBorderSecondary}`, padding: "8px 0" }}>
                <SupportedByMonashAutomation />
            </footer>
        </main>

        {showFeatures && <FeatureOverview />}
    </div>;
}

function FeatureOverview() {
    const { token } = theme.useToken();

    return <aside
        aria-labelledby="feature-overview-heading"
        style={{ flexGrow: 1, display: "flex", alignItems: "center", padding: "48px 64px" }}
    >
        <div style={{ maxWidth: 460 }}>
            <Title id="feature-overview-heading" level={4} style={{ marginTop: 0, marginBottom: 24, color: token.colorTextSecondary, fontWeight: 500 }}>
                Everything your committee needs, in one place
            </Title>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 20 }}>
                {FEATURES.map((feature) => <li key={feature.title} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                    <span style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 36,
                        height: 36,
                        flexShrink: 0,
                        borderRadius: token.borderRadius,
                        background: token.colorBgContainer,
                        border: `1px solid ${token.colorBorderSecondary}`,
                        color: token.colorPrimary,
                        fontSize: 16
                    }}>
                        {feature.icon}
                    </span>
                    <div>
                        <Text strong style={{ display: "block", fontSize: 15 }}>{feature.title}</Text>
                        <Text type="secondary">{feature.description}</Text>
                    </div>
                </li>)}
            </ul>
        </div>
    </aside>;
}
