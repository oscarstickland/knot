import { Alert, Button, Form, Input, Modal } from "antd";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { mutate } from "swr";
import { UpdateAttendanceSchema, type AttendanceCheckIn, type UpdateAttendanceData } from "@knot/backend/event-attendance";
import { AxiosInstance } from "@/lib/fetcher.tsx";
import { useAppNotification } from "@/lib/useAppNotification";

type EditAttendeeModalProps = {
    eventId: number;
    attendee: AttendanceCheckIn;
    open: boolean;
    onClose: () => void;
};

export function EditAttendeeModal({ eventId, attendee, open, onClose }: EditAttendeeModalProps) {
    const [api, contextHolder] = useAppNotification();
    const { handleSubmit, formState: { errors, isSubmitting }, control, reset } = useForm<UpdateAttendanceData>({
        resolver: zodResolver(UpdateAttendanceSchema),
        defaultValues: { name: attendee.name, email: attendee.email }
    });

    const handleCancel = () => {
        onClose();
        reset({ name: attendee.name, email: attendee.email });
    }

    const submit = async (data: UpdateAttendanceData) => {
        try {
            await AxiosInstance.put(`/attendance/${eventId}/check-ins/${attendee.id}`, data);
            await mutate(`/attendance/${eventId}/check-ins`);
            onClose();
            api["success"]({ title: "Success", description: "Attendee details have been updated." });
        } catch (err) {
            const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
                ?? "Attendee details could not be updated.";
            api["error"]({ title: "Error", description: message });
        }
    }

    return <>
        {contextHolder}
        <Modal
            open={open}
            title="Edit attendee"
            onCancel={handleCancel}
            destroyOnHidden
            footer={<>
                <Button onClick={handleCancel}>Cancel</Button>
                <Button type="primary" loading={isSubmitting} onClick={handleSubmit(submit)}>Save</Button>
            </>}
        >
            <Alert
                type="warning"
                showIcon
                title="You are editing someone else's details"
                description="Only make changes to correct a mistake. These details were entered by the attendee."
                style={{ marginBottom: "1em" }}
            />
            <form onSubmit={handleSubmit(submit)}>
                <Form.Item label="Name" layout="vertical" colon={false} validateStatus={errors.name ? "error" : ""} help={errors.name?.message}>
                    <Controller name="name" control={control} render={({ field }) => <Input {...field} placeholder="Name" />} />
                </Form.Item>
                <Form.Item label="Email" layout="vertical" colon={false} validateStatus={errors.email ? "error" : ""} help={errors.email?.message}>
                    <Controller name="email" control={control} render={({ field }) => <Input {...field} placeholder="Email" />} />
                </Form.Item>
            </form>
        </Modal>
    </>
}
