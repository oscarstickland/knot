import {type ClubEvent, type UpdateEventData, UpdateEventSchema} from "@knot/backend/events";
import {useState} from "react";
import {Button, DatePicker, Drawer, Form, Input, theme} from "antd";
import {Controller, useForm} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import {AxiosInstance} from "@/lib/fetcher.tsx";
import {mutate} from "swr";
import dayjs from "dayjs";
import {EditOutlined, PlusOutlined} from "@ant-design/icons";
import {z} from "zod";
import { useAppNotification } from "@/lib/useAppNotification";

type UpdateEventInput = z.input<typeof UpdateEventSchema>;
type UpdateEventOutput = z.output<typeof UpdateEventSchema>;

type EventFormModalProps =
    | { mode: "create"; event?: never }
    | { mode: "update"; event: ClubEvent };

export function EventModal({ mode, event }: EventFormModalProps) {
    const [ open, setOpen ] = useState(false);
    const [ api, contextHolder ] = useAppNotification();
    const { token } = theme.useToken();
    const isEditMode = mode === "update";
    const labelStyle = { fontWeight: token.fontWeightStrong };

    const { handleSubmit, formState: { errors }, control, reset } = useForm<UpdateEventInput, any, UpdateEventOutput>({
        resolver: zodResolver(UpdateEventSchema),
        defaultValues: isEditMode ? {
            name: event.name,
            start: event.start ? new Date(event.start).toISOString() : undefined,
            end: event.end ? new Date(event.end).toISOString() : undefined,
        } : { name: "", start: undefined, end: undefined },
    });

    const handleCancel = () => {
        setOpen(false);
        reset();
    }

    const submit = (data: UpdateEventData) => {
        const request = isEditMode
            ? AxiosInstance.put(`/events/${event.id}`, data)
            : AxiosInstance.post(`/events`, data);

        request.then(async (response) => {
            if (response.status === 200 || response.status === 201) {
                // Then it was successful, but we need to notify
                // SWR and invalidate the cache
                if (isEditMode) {
                    await mutate(`/events/${event.id}`);
                }
                await mutate("/events");
                setOpen(false);

                if (!isEditMode) reset();

                api['success']({
                    title: "Success",
                    description: `Event has been ${isEditMode ? "updated" : "created"}.`
                });
            }
        })
        .catch((err) => {
            const message = err?.response?.data?.message
                ?? `Event could not be ${isEditMode ? "updated" : "created"}.`;
            api['error']({ title: "Error", description: message });
        })
    }

    return <>
        {contextHolder}
        <Drawer
            open={open}
            onClose={handleCancel}
            title={`${isEditMode ? "Edit" : "Create"} Event`}
            width={420}
            footer={
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5em" }}>
                    <Button onClick={handleCancel}>Cancel</Button>
                    <Button type="primary" onClick={handleSubmit(submit)}>Save</Button>
                </div>
            }
        >
            <form onSubmit={handleSubmit(submit)}>
                <Form.Item
                    label={<span style={labelStyle}>Event Name</span>}
                    layout="vertical"
                    colon={false}
                    validateStatus={errors.name ? "error" : ""}
                    help={errors.name?.message}
                >
                    <Controller
                        name="name"
                        control={control}
                        render={({ field }) => <Input {...field} placeholder="Name"/>}
                    />
                </Form.Item>

                <Form.Item
                    label={<span style={labelStyle}>Start</span>}
                    layout="vertical"
                    colon={false}
                    validateStatus={errors.start ? "error" : ""}
                    help={errors.start?.message}
                >
                    <Controller
                        name="start"
                        control={control}
                        render={({ field }) => (
                            <DatePicker
                                showTime
                                style={{ width: "100%" }}
                                value={field.value ? dayjs(field.value) : null}
                                format={"D MMM YYYY h:mm A"}
                                onChange={(date) => field.onChange(date ? date.toISOString() : null)}
                            />
                        )}
                    />
                </Form.Item>

                <Form.Item
                    label={<span style={labelStyle}>End</span>}
                    layout="vertical"
                    colon={false}
                    validateStatus={errors.end ? "error" : ""}
                    help={errors.end?.message}
                >
                    <Controller
                        name="end"
                        control={control}
                        render={({ field }) => (
                            <DatePicker
                                showTime
                                style={{ width: "100%" }}
                                value={field.value ? dayjs(field.value) : null}
                                format={"D MMM YYYY h:mm A"}
                                onChange={(date) => field.onChange(date ? date.toISOString() : null)}
                            />
                        )}
                    />
                </Form.Item>

            </form>
        </Drawer>
        <Button
            onClick={() => setOpen(!open)}
            icon={isEditMode ? <EditOutlined /> : <PlusOutlined />}
        >{isEditMode ? "Edit Event" : "New Event"}</Button>
    </>
}