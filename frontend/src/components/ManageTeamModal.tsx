import { useState } from "react";
import { Alert, Button, Modal, Segmented, Select, Typography } from "antd";
import { TeamOutlined } from "@ant-design/icons";
import useSWR, { mutate } from "swr";
import type { AxiosError } from "axios";
import type { ClubMember } from "@knot/backend/user";
import type { EventTeamMember } from "@knot/backend/event-team";
import { AxiosInstance } from "@/lib/fetcher.tsx";
import { useAppNotification } from "@/lib/useAppNotification";

const { Text } = Typography;

type Audience = "everyone" | "selected";

interface ManageTeamModalProps {
    eventId: number;
    teamWide: boolean;
    team: EventTeamMember[];
}

const isManager = (member: Pick<ClubMember, "role">) => member.role === "admin" || member.role === "exec";

export function ManageTeamModal({ eventId, teamWide, team }: ManageTeamModalProps) {
    const [open, setOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [audience, setAudience] = useState<Audience>("everyone");
    const [selected, setSelected] = useState<number[]>([]);
    const [api, contextHolder] = useAppNotification();
    const { data: members, error, isLoading } = useSWR<ClubMember[], AxiosError>(open ? "/user" : null);

    const activeMembers = (members ?? []).filter((member) => member.status === "active");
    const managerIds = activeMembers.filter(isManager).map((member) => member.id);
    const initialIds = team.filter((member) => !isManager(member)).map((member) => member.id);

    // Admins and execs can always see every event, so they are shown locked in the list and never saved as assignees.
    const assignedIds = selected.filter((id) => !managerIds.includes(id));
    const isDirty = (audience === "everyone") !== teamWide
        || assignedIds.length !== initialIds.length
        || assignedIds.some((id) => !initialIds.includes(id));

    const openModal = () => {
        setAudience(teamWide ? "everyone" : "selected");
        setSelected(initialIds);
        setOpen(true);
    }

    const save = () => {
        setIsSubmitting(true);
        return AxiosInstance.put(`/events/${eventId}/team`, { userIds: assignedIds, teamWide: audience === "everyone" })
            .then(async () => {
                await Promise.all([mutate(`/events/${eventId}/team`), mutate(`/events/${eventId}`)]);
                await mutate((key) => typeof key === "string" && key.startsWith("/events?"));
                setOpen(false);
                api["success"]({ title: "Success", description: "Event access has been updated." });
            })
            .catch((err) => {
                const message = err?.response?.data?.message ?? "Team could not be updated.";
                api["error"]({ title: "Error", description: message });
            })
            .finally(() => setIsSubmitting(false));
    }

    // Clicking away, pressing Esc or hitting the close icon all save pending changes instead of dropping them.
    const dismiss = () => {
        if (isSubmitting) return;
        if (isDirty && members) void save();
        else setOpen(false);
    }

    const options = activeMembers.map((member) => ({
        value: member.id,
        label: isManager(member) ? `${member.name} · ${member.role}` : member.name,
        email: member.email,
        disabled: isManager(member)
    }));

    return <>
        {contextHolder}
        <Modal
            open={open}
            onCancel={dismiss}
            title="Who can see this event"
            centered
            footer={<Button type="primary" loading={isSubmitting} disabled={!members && audience === "selected"} onClick={dismiss}>Done</Button>}
        >
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <Segmented<Audience>
                    block
                    value={audience}
                    onChange={setAudience}
                    options={[
                        { value: "everyone", label: "Everyone in the club" },
                        { value: "selected", label: "Selected members" }
                    ]}
                />

                {audience === "everyone"
                    ? <Text type="secondary">Every member of the club can see this event, its tasks and its documents.</Text>
                    : error
                        ? <Alert type="error" showIcon title="Unable to load club members." />
                        : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <Select
                                mode="multiple"
                                style={{ width: "100%" }}
                                placeholder="Search members"
                                aria-label="Members who can see this event"
                                loading={isLoading}
                                value={[...new Set([...managerIds, ...selected])]}
                                onChange={setSelected}
                                options={options}
                                optionFilterProp="label"
                                filterOption={(input, option) =>
                                    `${option?.label ?? ""} ${option?.email ?? ""}`.toLowerCase().includes(input.toLowerCase())}
                                maxTagCount="responsive"
                            />
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                Admins and execs can always see every event. Changes save when you close this window.
                            </Text>
                        </div>
                }
            </div>
        </Modal>
        <Button type="text" size="small" icon={<TeamOutlined />} onClick={openModal}>Manage</Button>
    </>
}
