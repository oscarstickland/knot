import { Breadcrumb, Layout, theme, Typography } from "antd"

const { Content } = Layout;
const { Text } = Typography;

export function DashboardPage() {
    const { token } = theme.useToken();

    return <Layout style={{ padding: "24px 24px" }}>
        <Layout
            style={{
                padding: 24,
                background: token.colorBgContainer,
                borderRadius: token.borderRadiusLG
            }}
        >
            <Text>Dashboard Page</Text>
        </Layout>
    </Layout>
}