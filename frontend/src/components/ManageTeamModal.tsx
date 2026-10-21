import { useState } from "react";
import { Alert, Button, Modal, Select } from "antd";
import { TeamOutlined } from "@ant-design/icons";
import useSWR, { mutate } from "swr";
import type { AxiosError } from "axios";
import type { ClubMember } from "@knot/backend/user";
import type { EventTeamMember } from "@knot/backend/event-team";
import { AxiosInstance } from "@/lib/fetcher.tsx";
import { useAppNotification } from "@/lib/useAppNotification";

export function ManageTeamModal({ eventId, team }: { eventId: number; team: EventTeamMember[] }) {
    const [open, setOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selected, setSelected] = useState<number[]>([]);
    const [api, contextHolder] = useAppNotification();
    const { data: members, error, isLoading } = useSWR<ClubMember[], AxiosError>(open ? "/user" : null);

    const openModal = () => {
        setSelected(team.map((member) => member.id));
        setOpen(true);
    }

    const save = () => {
        setIsSubmitting(true);
        AxiosInstance.put(`/events/${eventId}/team`, { userIds: selected })
            .then(async () => {
                await mutate(`/events/${eventId}/team`);
                setOpen(false);
                api["success"]({ title: "Success", description: "Team has been updated." });
            })
            .catch((err) => {
                const message = err?.response?.data?.message ?? "Team could not be updated.";
                api["error"]({ title: "Error", description: message });
            })
            .finally(() => setIsSubmitting(false));
    }

    // Offboarded members can't be newly assigned, but anyone already on the team stays selectable so they can be removed.
    const options = (members ?? [])
        .filter((member) => member.status === "active" || selected.includes(member.id))
        .map((member) => ({ value: member.id, label: member.name, email: member.email }));

    return <>
        {contextHolder}
        <Modal
            open={open}
            onOk={save}
            onCancel={() => setOpen(false)}
            confirmLoading={isSubmitting}
            okText="Save"
            okButtonProps={{ disabled: !members }}
            title="Assign team"
            centered
        >
            {error
                ? <Alert type="error" showIcon title="Unable to load club members." />
                : <Select
                    mode="multiple"
                    style={{ width: "100%" }}
                    placeholder="Search members"
                    aria-label="Team members"
                    loading={isLoading}
                    value={selected}
                    onChange={setSelected}
                    options={options}
                    optionFilterProp="label"
                    filterOption={(input, option) =>
                        `${option?.label ?? ""} ${option?.email ?? ""}`.toLowerCase().includes(input.toLowerCase())}
                    maxTagCount="responsive"
                />
            }
        </Modal>
        <Button type="text" size="small" icon={<TeamOutlined />} onClick={openModal}>Manage</Button>
    </>
}
