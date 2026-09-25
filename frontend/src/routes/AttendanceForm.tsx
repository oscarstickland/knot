import { useParams } from "react-router";
import useSWR from "swr";
import type { AxiosError } from "axios";
import { Button, Card, Form, Input, notification, Result, Spin, Typography } from "antd";
import { RegisterAttendanceSchema, type RegisterAttendanceData, type EventAttendanceInfo } from "@knot/backend/event-attendance";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AxiosInstance } from "@/lib/fetcher.tsx";
import dayjs from "dayjs";
import { useState } from "react";

const { Title, Text } = Typography;

function CenteredPage(props: { children: React.ReactNode }) {
    return <div style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        padding: "24px"
    }}>
        {props.children}
    </div>
}

export function AttendanceForm() {
    const { slug } = useParams<{ slug: string }>();
    const { data, error, isLoading } = useSWR<EventAttendanceInfo, AxiosError>(slug ? `/attendance/${slug}/info` : null);

    if (isLoading) {
        return <CenteredPage><Spin size="large" /></CenteredPage>
    }

    if (error || !data) {
        return <CenteredPage>
            <Result status="404" title="404" subTitle="Sorry, the page you visited does not exist." />
        </CenteredPage>
    }

    return <CenteredPage>
        <Card style={{ maxWidth: 420, width: "100%" }}>
            <Title level={3} style={{ marginTop: 0, marginBottom: 4 }}>{data.name}</Title>
            <Text type="secondary">
                {dayjs(data.start).format("dddd D MMMM YYYY [at] h:mm A")}
            </Text>

            <RegistrationForm slug={data.slug} />
        </Card>
    </CenteredPage>
}

function RegistrationForm(props: { slug: string }) {
    const [api, contextHolder] = notification.useNotification();
    const [submitted, setSubmitted] = useState(false);

    const { handleSubmit, control, formState: { errors } } = useForm<RegisterAttendanceData>({
        resolver: zodResolver(RegisterAttendanceSchema),
        defaultValues: { name: "", email: "" }
    });

    const submit = (data: RegisterAttendanceData) => {
        AxiosInstance.post(`/attendance/${props.slug}/register`, data)
            .then(() => setSubmitted(true))
            .catch((err) => {
                const message = err?.response?.data?.message ?? "Unable to register your attendance.";
                api["error"]({ title: "Error", description: message });
            });
    }

    if (submitted) {
        return <Result
            status="success"
            title="You're checked in!"
            subTitle="Thanks for registering your attendance."
        />
    }

    return <>
        {contextHolder}
        <form onSubmit={handleSubmit(submit)} style={{ marginTop: "1.5em" }}>
            <Form.Item validateStatus={errors.name ? "error" : ""} help={errors.name?.message}>
                <Controller
                    name="name"
                    control={control}
                    render={({ field }) => <Input {...field} placeholder="Full name" />}
                />
            </Form.Item>

            <Form.Item validateStatus={errors.email ? "error" : ""} help={errors.email?.message}>
                <Controller
                    name="email"
                    control={control}
                    render={({ field }) => <Input {...field} placeholder="Email" />}
                />
            </Form.Item>

            <Button type="primary" htmlType="submit" block>Check In</Button>
        </form>
    </>
}
