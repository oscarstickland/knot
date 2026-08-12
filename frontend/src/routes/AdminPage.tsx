import { Layout, theme, Typography } from "antd"
import { ManageMembers } from "@/components/ManageMembers.tsx";

const { Title } = Typography;

export function AdminPage() {
    const { token } = theme.useToken();

    return <Layout style={{ padding: "24px 24px" }}>
        <Layout
            style={{
                padding: 24,
                background: token.colorBgContainer,
                borderRadius: token.borderRadiusLG
            }}
        >
            <Title level={2} style={{ margin: 0, marginBottom: "24px" }}>Admin Settings</Title>
            <Title level={4} style={{ margin: 0, marginBottom: "16px" }}>Manage Members</Title>
            <ManageMembers />
        </Layout>
    </Layout>
}