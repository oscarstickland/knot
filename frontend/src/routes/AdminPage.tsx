import { Layout, theme, Typography } from "antd"
import { ManageMembersModal } from "@/components/ManageMembersModal.tsx";

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
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: "24px"
            }}>
                <Title level={2} style={{ margin: 0 }}>Admin Settings</Title>
                <ManageMembersModal />
            </div>
        </Layout>
    </Layout>
}