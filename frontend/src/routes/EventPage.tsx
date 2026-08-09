import {Button, DatePicker, Form, Input, Layout, Modal, notification, Result, Spin, theme, Typography} from "antd";
import {useParams} from "react-router";
import useSWR, {mutate} from "swr";
import {type ClubEvent, type UpdateEventData, UpdateEventSchema} from "@knot/backend/events";
import axios, {type AxiosError} from "axios";
import {useState} from "react";
import {EditOutlined} from "@ant-design/icons";
import {Controller, useForm} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import {AxiosInstance} from "@/lib/fetcher.tsx";
import dayjs from "dayjs";
import {z} from "zod";

const { Text, Title } = Typography;

export function EventPage() {
    const { token } = theme.useToken();
    const { id } = useParams<{ id: string }>();

    if (!id) return <p>Unable to retrieve param</p>

    return <Layout style={{ padding: "24px 24px" }}>
        <Layout
            style={{
                padding: 24,
                background: token.colorBgContainer,
                borderRadius: token.borderRadiusLG
            }}
        >
            <EventInformation id={id} />
        </Layout>
    </Layout>
}

function EventInformation(props: { id: string }) {
    const { data, error, isLoading } = useSWR<ClubEvent, AxiosError>(props.id ? `/events/${props.id}` : null);

    if (isLoading) return <Spin />
    if (error) {
        return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: "100%" }}>
            <Result
                status="error"
                title={ error.status == 404 ? "Not Found" : "Error"}
                subTitle={ error.status === 404 ? "This event could not be found." : "Unable to fetch event."}
            />
        </div>
    }

    return <div style={{ display: "flex", justifyContent: "space-between" }}>
        <Title level={2} style={{ marginTop: '0' }}>{data.name}</Title>
        <UpdateModal event={data} />
    </div>
}

type UpdateEventInput = z.input<typeof UpdateEventSchema>;
type UpdateEventOutput = z.output<typeof UpdateEventSchema>;

function UpdateModal(props: { event: ClubEvent }) {
    const [ open, setOpen ] = useState(false);
    const [ api, contextHolder ] = notification.useNotification();

    const { handleSubmit, formState: { errors }, control } = useForm<UpdateEventInput, any, UpdateEventOutput>({
        resolver: zodResolver(UpdateEventSchema),
        defaultValues: {
            name: props.event.name,
            start: props.event.start ? new Date(props.event.start).toISOString() : undefined,
            end: props.event.end ? new Date(props.event.end).toISOString() : undefined,
        }
    });

    const handleCancel = () => {
        setOpen(false);
    }

    const submit = (data: UpdateEventData) => {
        AxiosInstance.put(`/events/${props.event.id}`, data)
            .then(async (response) => {
                if (response.status === 200) {
                    // Then it was successful, but we need to notify
                    // SWR and invalidate the cache
                    await mutate(`/events/${props.event.id}`);
                    setOpen(false);

                    api['success']({
                        title: "Success",
                        description: "Event has been updated.",
                    })
                }
            })
            .catch((_) => {
                api['error']({
                    title: "Error",
                    description: "Event could not be updated.",
                })
            })
    }

    return <>
        {contextHolder}
        <Modal
            open={open}
            onOk={handleSubmit(submit)}
            onCancel={handleCancel}
            title={"Edit Event"}
            centered
        >
            <form onSubmit={handleSubmit(submit)}>
                <Form.Item
                    validateStatus={errors.name ? "error" : ""}
                    help={errors.name?.message}
                >
                    <Controller
                        name="name"
                        control={control}
                        render={({ field }) => <Input {...field} placeholder="Name"/>}
                    />
                </Form.Item>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Form.Item
                        validateStatus={errors.start ? "error" : ""}
                        help={errors.start?.message}
                    >
                        <Controller
                            name="start"
                            control={control}
                            render={({ field }) => (
                                <DatePicker
                                    showTime
                                    value={field.value ? dayjs(field.value) : null}
                                    format={"DD/MM/YYYY h:mm A"}
                                    onChange={(date) => field.onChange(date ? date.toISOString() : null)}
                                />
                            )}
                        />
                    </Form.Item>

                    <Form.Item
                        validateStatus={errors.end ? "error" : ""}
                        help={errors.end?.message}
                    >
                        <Controller
                            name="end"
                            control={control}
                            render={({ field }) => (
                                <DatePicker
                                    showTime
                                    value={field.value ? dayjs(field.value) : null}
                                    format={"DD/MM/YYYY h:mm A"}
                                    onChange={(date) => field.onChange(date ? date.toISOString() : null)}
                                />
                            )}
                        />
                    </Form.Item>
                </div>

            </form>
        </Modal>
        <Button
            onClick={() => setOpen(!open)}
            icon={<EditOutlined />}
        >Edit Event</Button>
    </>
}