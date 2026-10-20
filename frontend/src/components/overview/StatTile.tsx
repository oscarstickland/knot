import { Card, theme, Typography } from "antd";
import type { ReactNode } from "react";

const { Text } = Typography;

export type StatTone = "default" | "positive" | "negative" | "warning";

interface StatTileProps {
    label: string;
    value: ReactNode;
    caption: ReactNode;
    tone?: StatTone;
}

export function StatTile({ label, value, caption, tone = "default" }: StatTileProps) {
    const { token } = theme.useToken();
    const colours: Record<StatTone, string | undefined> = {
        default: undefined,
        positive: token.colorSuccess,
        negative: token.colorError,
        warning: token.colorWarning
    };

    return <Card size="small" style={{ height: "100%" }} styles={{ body: { padding: "16px 20px" } }}>
        <Text type="secondary">{label}</Text>
        <div style={{
            fontSize: token.fontSizeHeading2,
            fontWeight: 600,
            lineHeight: 1.25,
            margin: "4px 0",
            color: colours[tone],
            fontVariantNumeric: "tabular-nums"
        }}>
            {value}
        </div>
        <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>{caption}</Text>
    </Card>
}
