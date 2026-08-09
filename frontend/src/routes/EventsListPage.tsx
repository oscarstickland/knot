import {Layout, theme, Typography} from "antd";

const { Text } = Typography;

export function EventsListPage() {
    const { token } = theme.useToken();

    return <Layout style={{ padding: "24px 24px" }}>
        <Layout
            style={{
                padding: 24,
                background: token.colorBgContainer,
                borderRadius: token.borderRadiusLG
            }}
        >
            <Text>Events Page</Text>
        </Layout>
    </Layout>
}