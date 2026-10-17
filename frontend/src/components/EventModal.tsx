import {type ClubEvent, DuplicateEventSchema, type UpdateEventData, UpdateEventSchema} from "@knot/backend/events";
import {useState} from "react";
import {Button, DatePicker, Drawer, Form, Input, InputNumber, Switch, theme, Typography} from "antd";
import {Controller, type Control, type Resolver, useForm} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import {AxiosInstance} from "@/lib/fetcher.tsx";
import {mutate} from "swr";
import dayjs from "dayjs";
import {CopyOutlined, EditOutlined, PlusOutlined} from "@ant-design/icons";
import {z} from "zod";
import { useAppNotification } from "@/lib/useAppNotification";
import { suggestDuplicateDefaults } from "@/lib/duplicateEvent";

type EventFormInput = z.input<typeof DuplicateEventSchema>;
type EventFormOutput = z.output<typeof DuplicateEventSchema>;

type EventFormModalProps =
    | { mode: "create"; event?: never; open?: boolean; onOpenChange?: (open: boolean) => void }
    | { mode: "update"; event: ClubEvent; open?: boolean; onOpenChange?: (open: boolean) => void }
    | { mode: "duplicate"; event: ClubEvent; open?: boolean; onOpenChange?: (open: boolean) => void };

const MODE_COPY = {
    create: { title: "Create Event", done: "created", button: "New Event", icon: <PlusOutlined /> },
    update: { title: "Edit Event", done: "updated", button: "Edit Event", icon: <EditOutlined /> },
    duplicate: { title: "Duplicate Event", done: "duplicated", button: "Duplicate", icon: <CopyOutlined /> }
} as const;

function defaultValuesFor(props: EventFormModalProps): EventFormInput {
    if (props.mode === "create") {
        return { name: "", location: "", start: undefined as unknown as string, end: undefined as unknown as string, expectedAttendees: "", includeTasks: false, includeBudget: false };
    }
    const { event } = props;
    const base = {
        location: event.location,
        expectedAttendees: event.expectedAttendees ?? "",
        includeTasks: false,
        includeBudget: false
    };
    return props.mode === "update"
        ? { ...base, name: event.name, start: new Date(event.start).toISOString(), end: new Date(event.end).toISOString() }
        : { ...base, ...suggestDuplicateDefaults(event) };
}

export function EventModal(props: EventFormModalProps) {
    const { mode, event, open: openProp, onOpenChange } = props;
    const isControlled = openProp !== undefined;
    const [ internalOpen, setInternalOpen ] = useState(false);
    const open = isControlled ? openProp : internalOpen;
    const setOpen = (value: boolean) => isControlled ? onOpenChange?.(value) : setInternalOpen(value);
    const [ api, contextHolder ] = useAppNotification();
    const { token } = theme.useToken();
    const isEditMode = mode === "update";
    const isDuplicateMode = mode === "duplicate";
    const copy = MODE_COPY[mode];
    const labelStyle = { fontWeight: token.fontWeightStrong };

    const { handleSubmit, formState: { errors }, control, reset } = useForm<EventFormInput, any, EventFormOutput>({
        resolver: zodResolver(isDuplicateMode ? DuplicateEventSchema : UpdateEventSchema) as Resolver<EventFormInput, any, EventFormOutput>,
        defaultValues: defaultValuesFor(props),
    });

    const handleCancel = () => {
        setOpen(false);
        reset(defaultValuesFor(props));
    }

    const submit = (data: EventFormOutput) => {
        const { includeTasks, includeBudget, ...details }: UpdateEventData & Pick<EventFormOutput, "includeTasks" | "includeBudget"> = data;
        const request = isEditMode
            ? AxiosInstance.put(`/events/${event.id}`, details)
            : isDuplicateMode
                ? AxiosInstance.post(`/events/${event.id}/duplicate`, { ...details, includeTasks, includeBudget })
                : AxiosInstance.post(`/events`, details);

        request.then(async (response) => {
            if (response.status === 200 || response.status === 201) {
                // Then it was successful, but we need to notify
                // SWR and invalidate the cache
                if (isEditMode) {
                    await mutate(`/events/${event.id}`);
                }
                await mutate((key) => typeof key === "string" && key.startsWith("/events"));
                setOpen(false);

                if (mode === "create") reset();

                api['success']({
                    title: "Success",
                    description: `Event has been ${copy.done}.`
                });
            }
        })
        .catch((err) => {
            const message = err?.response?.data?.message
                ?? `Event could not be ${copy.done}.`;
            api['error']({ title: "Error", description: message });
        })
    }

    return <>
        {contextHolder}
        <Drawer
            open={open}
            onClose={handleCancel}
            title={copy.title}
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
                    label={<span style={labelStyle}>Location</span>}
                    layout="vertical"
                    colon={false}
                    validateStatus={errors.location ? "error" : ""}
                    help={errors.location?.message}
                >
                    <Controller
                        name="location"
                        control={control}
                        render={({ field }) => <Input {...field} placeholder="Location"/>}
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
                <Form.Item
                    label={<span style={labelStyle}>Expected Attendees</span>}
                    layout="vertical"
                    validateStatus={errors.expectedAttendees ? "error" : ""}
                    help={errors.expectedAttendees?.message}
                >
                    <Controller
                        name="expectedAttendees"
                        control={control}
                        render={({ field }) => (
                            <InputNumber
                                style={{ width: "100%" }}
                                min={1}
                                placeholder="Expected attendees (optional)"
                                value={typeof field.value === "number" ? field.value : null}
                                onChange={(value) => field.onChange(value ?? "")}
                            />
                        )}
                    />
                </Form.Item>

                { isDuplicateMode &&
                    <DuplicateContents
                        control={control}
                        sourceName={event.name}
                    />
                }
            </form>
        </Drawer>
        { !isControlled &&
            <Button
                onClick={() => setOpen(!open)}
                icon={copy.icon}
            >{copy.button}</Button>
        }
    </>
}

const CONTENT_OPTIONS = [
    { name: "includeTasks", label: "Tasks", hint: "Copied back to backlog, with due dates moved to match. Assignees are not copied." },
    { name: "includeBudget", label: "Budget categories", hint: "Categories and their allocations. Expenses are not copied." }
] as const;

function DuplicateContents({ control, sourceName }: { control: Control<EventFormInput, any, EventFormOutput>; sourceName: string }) {
    const { token } = theme.useToken();

    return <fieldset style={{
        margin: 0,
        padding: token.paddingMD,
        border: `1px dashed ${token.colorBorder}`,
        borderRadius: token.borderRadiusLG,
        background: token.colorFillQuaternary
    }}>
        <legend style={{ padding: `0 ${token.paddingXS}px`, fontWeight: token.fontWeightStrong, fontSize: token.fontSize }}>
            Bring over from "{sourceName}"
        </legend>
        { CONTENT_OPTIONS.map((option) =>
            <Controller
                key={option.name}
                name={option.name}
                control={control}
                render={({ field }) => (
                    <label style={{ display: "flex", gap: token.marginSM, alignItems: "flex-start", padding: `${token.paddingXS}px 0`, cursor: "pointer" }}>
                        <Switch size="small" checked={!!field.value} onChange={field.onChange} style={{ marginTop: 4 }} />
                        <span>
                            <Typography.Text strong>{option.label}</Typography.Text>
                            <br />
                            <Typography.Text type="secondary">{option.hint}</Typography.Text>
                        </span>
                    </label>
                )}
            />
        )}
    </fieldset>
}
