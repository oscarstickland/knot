import { useSuperAdmin, useUserMutate } from "@/lib/auth";
import { Avatar, Button, Layout, Menu, Tag, theme, Typography } from "antd";
import { Outlet, useLocation, useNavigate } from "react-router";
import { ApartmentOutlined, LogoutOutlined, UserOutlined } from "@ant-design/icons";
import { AxiosInstance } from "@/lib/fetcher";
import { KnotLogo } from "@/components/KnotLogo";

const { Sider } = Layout;
const { Text } = Typography;

// The only shell a super admin ever sees. Mirrors the club AppShell sidebar so the product feels like one thing.
export function SuperAdminShell() {
    const { token } = theme.useToken();
    const navigate = useNavigate();
    const location = useLocation();

    return <Layout style={{ minHeight: "100vh" }}>
        <Sider
            width={250}
            style={{
                background: token.colorBgContainer,
                borderRight: "1px solid",
                borderColor: token.colorBorderSecondary,
                position: "sticky",
                top: 0,
                height: "100vh",
                overflow: "auto"
            }}
        >
            <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5em", padding: "18px 10px" }}>
                    <KnotLogo />
                    <Tag color="gold" style={{ margin: 0, letterSpacing: "0.08em", fontSize: 10 }}>PLATFORM CONSOLE</Tag>
                </div>
                <Menu
                    style={{ flexGrow: 1, borderRight: "none" }}
                    items={[{ key: "/super", icon: <ApartmentOutlined />, label: "Clubs" }]}
                    selectedKeys={[location.pathname.startsWith("/super") ? "/super" : location.pathname]}
                    onClick={(info) => navigate(info.key)}
                />
                <div style={{ borderTop: "1px solid", borderColor: token.colorBorderSecondary }}>
                    <CurrentSuperAdmin />
                </div>
            </div>
        </Sider>
        <Layout.Content>
            <Outlet />
        </Layout.Content>
    </Layout>;
}

function CurrentSuperAdmin() {
    const navigate = useNavigate();
    const user = useSuperAdmin();
    const userMutate = useUserMutate();

    const logout = () => {
        AxiosInstance.post("/auth/logout")
            .finally(() => {
                if (userMutate) userMutate();
                return navigate("/");
            });
    };

    return <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "0.5em", padding: "0.5em 1em" }}>
        <div style={{ display: "flex", alignItems: "center", flexGrow: 1, gap: "0.5em", minWidth: 0 }}>
            <Avatar icon={<UserOutlined />} shape="square" size="default" />
            <div style={{ minWidth: 0 }}>
                <Text strong ellipsis style={{ fontSize: "14px", lineHeight: "1.2", display: "block" }}>{user.name}</Text>
                <Tag color="gold" style={{ margin: 0, fontSize: "10px", lineHeight: "16px", padding: "0 6px" }}>SUPER ADMIN</Tag>
            </div>
        </div>
        <Button type="text" danger icon={<LogoutOutlined />} title="Logout" aria-label="Logout" onClick={logout} />
    </div>;
}
