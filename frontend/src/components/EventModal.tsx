import {type ClubEvent, type UpdateEventData, UpdateEventSchema} from "@knot/backend/events";
import {useState} from "react";
import {Button, DatePicker, Form, Input, Modal, notification} from "antd";
import {Controller, useForm} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import {AxiosInstance} from "@/lib/fetcher.tsx";
import {mutate} from "swr";
import dayjs from "dayjs";
import {EditOutlined, PlusOutlined} from "@ant-design/icons";
import {z} from "zod";

type UpdateEventInput = z.input<typeof UpdateEventSchema>;
type UpdateEventOutput = z.output<typeof UpdateEventSchema>;

type EventFormModalProps =
    | { mode: "create"; event?: never }
    | { mode: "update"; event: ClubEvent };

export function EventModal({ mode, event }: EventFormModalProps) {
    const [ open, setOpen ] = useState(false);
    const [ api, contextHolder ] = notification.useNotification();
    const isEditMode = mode === "update";

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
        .catch((_) => {
            api['error']({
                title: "Error",
                description: `Event could not be ${isEditMode ? "updated" : "created"}.`
            });
        })
    }

    return <>
        {contextHolder}
        <Modal
            open={open}
            onOk={handleSubmit(submit)}
            onCancel={handleCancel}
            title={`${isEditMode ? "Edit" : "Create"} Event`}
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
            icon={isEditMode ? <EditOutlined /> : <PlusOutlined />}
        >{isEditMode ? "Edit Event" : "New Event"}</Button>
    </>
}