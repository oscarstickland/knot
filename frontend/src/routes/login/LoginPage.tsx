import { LoginForm } from "../../components/LoginForm.tsx";
import { Typography } from "antd";
import { PublicLayout } from "@/components/PublicLayout.tsx";

const { Title, Text } = Typography;

export function LoginPage() {
    return <PublicLayout>
        <Title level={2} style={{ marginTop: 0, marginBottom: 4 }}>Sign in</Title>
        <Text type="secondary" style={{ display: "block", marginBottom: 28 }}>
            Use the email your club admin added you with.
        </Text>
        <LoginForm />
    </PublicLayout>;
}
