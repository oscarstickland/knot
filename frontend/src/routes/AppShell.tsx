import { useUser, useUserMutate } from "@/lib/auth";
import { Avatar, Breadcrumb, Button, Layout, Menu, Tag, theme, Typography, type MenuProps } from "antd";
import { Outlet, useNavigate } from "react-router";
import React from "react";
import { AxiosInstance } from "@/lib/fetcher";
import {LogoutOutlined, StepBackwardOutlined, UserOutlined} from "@ant-design/icons";

const { Header, Content, Sider } = Layout;
const { Title, Text } = Typography;

const items1: MenuProps['items'] = ['1', '2', '3'].map((key) => ({
  key,
  label: `nav ${key}`,
}));

export const AppShell: React.FC = () => {
    const { token } = theme.useToken();

    return (
        <Layout
            style={{
                minHeight: "100vh"
            }}
        >
            <Sider 
                width={250} 
                style={{ 
                    background: token.colorBgContainer, 
                    borderRight: "1px solid", 
                    borderColor: token.colorBorderSecondary
                }}
            >
                <div style={{
                    display: "flex",
                    flexDirection: "column",
                    minHeight: "100vh"
                }}>
                    <div style={{ 
                        display: "flex", 
                        alignItems: "center",
                        flexDirection: 'column', 
                        background: token.colorBgContainer,
                        padding: "18px 10px",
                        gap: "0.5em",
                        textAlign: "center"
                    }}>
                        <Title 
                            level={3}
                            style={{ background: token.colorBgContainer, margin: 0 }}
                        >Insert Club Name</Title>
                        <Text 
                            style={{ background: token.colorBgContainer, margin: 0, color: token.colorTextTertiary }}
                        >Powered by Knot</Text>
                    </div>
                    <Menu
                    
                        defaultSelectedKeys={['1']}
                        defaultOpenKeys={['sub1']}
                        style={{ flexGrow: 1, borderRight: "none" }}
                        items={items1}
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