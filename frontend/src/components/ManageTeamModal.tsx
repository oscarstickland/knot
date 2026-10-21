import { useState } from "react";
import { Alert, Button, List, Modal, Segmented, Select, Typography } from "antd";
import { CloseOutlined, TeamOutlined } from "@ant-design/icons";
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

    // Admins and execs can always see every event, so they are never listed or saved as assignees.
    const assignable = (members ?? []).filter((member) => member.status === "active" && !isManager(member));
    const initialIds = team.filter((member) => !isManager(member)).map((member) => member.id);

    const isDirty = (audience === "everyone") !== teamWide
        || selected.length !== initialIds.length
        || selected.some((id) => !initialIds.includes(id));

    const openModal = () => {
        setAudience(teamWide ? "everyone" : "selected");
        setSelected(initialIds);
        setOpen(true);
    }

    const save = () => {
        setIsSubmitting(true);
        return AxiosInstance.put(`/events/${eventId}/team`, { userIds: selected, teamWide: audience === "everyone" })
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

    const options = assignable
        .filter((member) => !selected.includes(member.id))
        .map((member) => ({ value: member.id, label: member.name, email: member.email }));

    // Members already on the team who are no longer assignable (e.g. offboarded) stay listed so they can be removed.
    const selectedMembers = selected.map((id): { id: number; name: string; email?: string } => {
        const listed = members?.find((m) => m.id === id);
        return { id, name: listed?.name ?? team.find((m) => m.id === id)?.name ?? `Member ${id}`, email: listed?.email };
    });

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
                        : <div>
                            <Typography.Paragraph type="secondary">
                                Execs and above can access this event automatically, so they don't need to be assigned. Changes save when you close this window.
                            </Typography.Paragraph>
                            <Select
                                showSearch
                                style={{ width: "100%" }}
                                placeholder="Search members to add"
                                aria-label="Add team member"
                                loading={isLoading}
                                value={null}
                                onChange={(id: number) => setSelected((current) => [...current, id])}
                                options={options}
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
                                                aria-label={`Remove ${member.name}`}
                                                onClick={() => setSelected((current) => current.filter((id) => id !== member.id))}
                                            />
                                        ]}
                                    >
                                        <List.Item.Meta title={member.name} description={member.email} />
                                    </List.Item>
                                )}
                            />
                        </div>
                }
            </div>
        </Modal>
        <Button type="text" size="small" icon={<TeamOutlined />} onClick={openModal}>Manage</Button>
    </>
}
