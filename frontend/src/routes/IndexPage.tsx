import { Button, Typography } from "antd";
import { useNavigate } from "react-router";
import { PublicLayout } from "@/components/PublicLayout.tsx";

const { Title, Paragraph } = Typography;

export function IndexPage() {
    const navigate = useNavigate();

    return <PublicLayout>
        <Title level={2} style={{ marginTop: 0, marginBottom: 12, textWrap: "balance" }}>Run your club from one place</Title>
        <Paragraph type="secondary" style={{ fontSize: 15, marginBottom: 32 }}>
            Knot keeps your club's events, tasks, budgets and attendance together, so the whole committee can see what's happening.
        </Paragraph>
        <Button type="primary" size="large" block onClick={() => navigate("/auth/login")}>
            Sign in
        </Button>
    </PublicLayout>;
}
