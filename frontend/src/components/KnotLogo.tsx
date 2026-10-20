import { Typography } from "antd";

const { Text } = Typography;

export function KnotLogo() {
    return <div style={{ display: "flex", alignItems: "center", gap: "0.6em" }}>
        <img src="/knot-icon.svg" alt="" width={32} height={32} style={{ display: "block" }} />
        <Text strong style={{ fontSize: "20px", letterSpacing: "-0.01em" }}>Knot</Text>
    </div>;
}
