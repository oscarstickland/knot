import { theme, Typography } from "antd";
import monashAutomationLogo from "@/assets/monash-automation-logo.svg";

const { Text } = Typography;

export function SupportedByMonashAutomation() {
    const { token } = theme.useToken();

    return <div
        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.25em", padding: "0.5em 1em" }}
    >
        <Text style={{ fontSize: "11px", color: token.colorTextTertiary }}>Supported by</Text>
        <img src={monashAutomationLogo} alt="Monash Automation" width={100} height={22} style={{ objectFit: "contain" }} />
    </div>;
}
