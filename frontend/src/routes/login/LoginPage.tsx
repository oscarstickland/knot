import { LoginForm } from "./LoginForm";
import { theme, Typography } from "antd";

const { Title } = Typography;

export function LoginPage() {
    const { token } = theme.useToken();


    return <div style={{ 
            display: 'flex', 
            alignItems: "center", 
            justifyContent: "center", 
            height: "100vh" 
        }}>
        <div>
            <Title>Login to Knot</Title>

            <div style={{ minWidth: "20em" }}>
                <LoginForm />
            </div>
        </div>
    </div>
}