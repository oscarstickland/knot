import { useUser, useUserMutate } from "@/lib/auth";
import { Avatar, Breadcrumb, Button, Layout, Menu, Tag, theme, Typography, type MenuProps } from "antd";
import {Outlet, useLocation, useNavigate} from "react-router";
import React from "react";
import { AxiosInstance } from "@/lib/fetcher";
import {
    BankOutlined, CalendarOutlined,
    HomeOutlined,
    LogoutOutlined,
    SettingOutlined,
    UserOutlined
} from "@ant-design/icons";

const { Sider } = Layout;
const { Title, Text } = Typography;

function useMenuItems(): MenuProps['items'] {
    const user = useUser();

    const dashboard: MenuProps['items'] = [{
        key: "/app",
        icon: <HomeOutlined />,
        label: "Dashboard"
    }]

    const getPrimaryItems = (): MenuProps['items'] => {
        let result: MenuProps['items'] = [];

        if (user.role === 'admin' || user.role === 'exec') {
            // Budgeting - if user is admin or exec
            result.push({
                key: "/app/budget",
                icon: <BankOutlined />,
                label: "Budgeting"
            });
        }

        // Events - all users
        result.push({
            key: "/app/events",
            icon: <CalendarOutlined />,
            label: "Events"
        });

        // Admin Panel - if user is admin
        if (user.role === 'admin') {
            result.push({
                key: "/app/admin",
                icon: <SettingOutlined />,
                label: "Admin Settings"
            });
        }

        return result
    }

    return [
        ...dashboard,
        ...getPrimaryItems(),
    ]
}

export const AppShell: React.FC = () => {
    const location = useLocation();
    const { token } = theme.useToken();
    const navigate = useNavigate();
    const user = useUser();
    const menuItems = useMenuItems();

    const onMenuClick: MenuProps['onClick'] = (info) => {
        navigate(info.key);
    }

    return (
        <Layout style={{minHeight: "100vh"}}>
            <Sider
                width={250}
                style={{ 
                    background: token.colorBgContainer,
                    borderRight: "1px solid",
                    borderColor: token.colorBorderSecondary
                }}
            >
                <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
                    <div style={{ 
                        display: "flex", 
                        alignItems: "center",
                        flexDirection: 'column', 
                        background: token.colorBgContainer,
                        padding: "18px 10px",
                        gap: "0.5em",
                        textAlign: "center"
                    }}>
                        <Title level={3} style={{ background: token.colorBgContainer, margin: 0 }}>
                            { user.club.name }
                        </Title>
                        <Text style={{ background: token.colorBgContainer, margin: 0, color: token.colorTextTertiary }}>
                            Powered by Knot
                        </Text>
                    </div>
                    <Menu
                        style={{ flexGrow: 1, borderRight: "none" }}
                        items={menuItems}
                        selectedKeys={[location.pathname]}
                        onClick={onMenuClick}
                    />
                    <div style={{ borderTop: "1px solid", borderColor: token.colorBorderSecondary }}>
                        <CurrentUser />
                    </div>

                </div>
            </Sider>
            <Outlet />
        </Layout>
    );
};

function CurrentUser() {
    const navigate = useNavigate();
    const user = useUser();
    const userMutate = useUserMutate();

    const logout = () => {
        AxiosInstance.post("/auth/logout")
            .finally(() => {
                if (userMutate) userMutate();
                return navigate("/");
            })
    }

    return <div
        style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "0.5em", padding: "0.5em 1em" }}
    >
        <div style={{ display: "flex", alignItems: "center", flexGrow: 1, gap: "0.5em" }}>
            <Avatar icon={<UserOutlined />} shape="square" size="default" />
            <div>
                <Text strong ellipsis style={{ fontSize: "14px", lineHeight: "1.2" }}>{user.name}</Text>
                <div>
                    <Tag
                        color={user.role === "admin" ? "red" : ( user.role === "exec" ? "blue" : "default")}
                        style={{ margin: 0, fontSize: "10px", lineHeight: "16px", padding: "0 6px" }}
                    >
                        {user.role.toUpperCase()}
                    </Tag>
                </div>
            </div>
        </div>
        <Button type="text" danger icon={<LogoutOutlined />} title="Logout" onClick={logout} />
    </div>;
}