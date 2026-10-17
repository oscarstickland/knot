import { theme, Typography } from "antd";

const { Text } = Typography;

// Placeholder until the Knot logo is finalised - swap the dashed mark for the real asset here.
export function KnotLogo() {
    const { token } = theme.useToken();

    return <div style={{ display: "flex", alignItems: "center", gap: "0.6em" }}>
        <div
            aria-hidden
            style={{
                width: 32,
                height: 32,
                borderRadius: token.borderRadius,
                border: "1.5px dashed",
                borderColor: token.colorBorder,
                background: token.colorFillQuaternary
            }}
        />
        <Text strong style={{ fontSize: "20px", letterSpacing: "-0.01em" }}>Knot</Text>
    </div>;
}
