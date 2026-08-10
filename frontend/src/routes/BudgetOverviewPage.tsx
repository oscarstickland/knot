import { Layout, theme, Typography } from "antd"

const { Text } = Typography;

export function BudgetOverviewPage() {
    const { token } = theme.useToken();

    return <Layout style={{ padding: "24px 24px" }}>
        <Layout
            style={{
                padding: 24,
                background: token.colorBgContainer,
                borderRadius: token.borderRadiusLG
            }}
        >
            <Text>Budget Overview</Text>
        </Layout>
    </Layout>
}