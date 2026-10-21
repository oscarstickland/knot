import { useState } from "react";
import { Alert, Button, List, Modal, Select, Typography } from "antd";
import { CloseOutlined, TeamOutlined } from "@ant-design/icons";
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

    const selectedMembers = selected
        .map((id) => options.find((option) => option.value === id))
        .filter((option) => option !== undefined);

    return <>
        {contextHolder}
        <Modal
            open={open}
            onOk={save}
            onCancel={() => setOpen(false)}
            confirmLoading={isSubmitting}
            okText="Save"
            okButtonProps={{ disabled: !members }}
            title="Assign Team Members"
            centered
        >
            <Typography.Paragraph type="secondary">
                Execs and above can access this event automatically, so they don't need to be assigned.
            </Typography.Paragraph>
            {error
                ? <Alert type="error" showIcon title="Unable to load club members." />
                : <>
                    <Select
                        showSearch
                        style={{ width: "100%" }}
                        placeholder="Search members to add"
                        aria-label="Add team member"
                        loading={isLoading}
                        value={null}
                        onChange={(id: number) => setSelected((current) => [...current, id])}
                        options={options.filter((option) => !selected.includes(option.value))}
                        optionFilterProp="label"
                        filterOption={(input, option) =>
                            `${option?.label ?? ""} ${option?.email ?? ""}`.toLowerCase().includes(input.toLowerCase())}
                    />
                    <List
                        size="small"
                        style={{ marginTop: 16, maxHeight: 320, overflowY: "auto" }}
                        locale={{ emptyText: "No team members assigned yet." }}
                        dataSource={selectedMembers}
                        renderItem={(member) => (
                            <List.Item
                                actions={[
                                    <Button
                                        key="remove"
                                        type="text"
                                        size="small"
                                        danger
                                        icon={<CloseOutlined />}
                                        aria-label={`Remove ${member.label}`}
                                        onClick={() => setSelected((current) => current.filter((id) => id !== member.value))}
                                    />
                                ]}
                            >
                                <List.Item.Meta title={member.label} description={member.email} />
                            </List.Item>
                        )}
                    />
                </>
            }
        </Modal>
        <Button type="text" size="small" icon={<TeamOutlined />} onClick={openModal}>Manage</Button>
    </>
}
