import { useState } from "react";
import { Button, Modal, Result, Table, Tag, Typography, type TableProps } from "antd";
import { TeamOutlined } from "@ant-design/icons";
import useSWR from "swr";
import type { ClubMember } from "@knot/backend/user";
import { EditMemberModal } from "@/components/EditMemberModal.tsx";

const { Text } = Typography;

const roleColor = (role: ClubMember["role"]) =>
    role === "admin" ? "red" : role === "exec" ? "blue" : "default";

export function ManageMembersModal() {
    const [open, setOpen] = useState(false);

    return <>
        <Modal
            open={open}
            onCancel={() => setOpen(false)}
            footer={null}
            title="Manage Members"
            width={800}
            centered
        >
            <Text type="secondary" style={{ display: "block", marginTop: "-8px", marginBottom: "16px" }}>
                Click a member to change their details
            </Text>
            <MembersTable />
        </Modal>
        <Button icon={<TeamOutlined />} onClick={() => setOpen(true)}>Manage Members</Button>
    </>
}

function MembersTable() {
    const { data, isLoading, error } = useSWR<ClubMember[]>("/user");
    const [selectedMember, setSelectedMember] = useState<ClubMember | null>(null);

    const columns: TableProps<ClubMember>['columns'] = [
        { key: "name", title: "Name", dataIndex: "name" },
        { key: "email", title: "Email", dataIndex: "email" },
        {
            key: "role",
            title: "Account Type",
            dataIndex: "role",
            render: (role: ClubMember["role"]) => <Tag color={roleColor(role)}>{role.toUpperCase()}</Tag>
        }
    ];

    if (error) {
        return <Result status="error" title="Retrieval Error" subTitle="Unable to fetch club members." />
    }

    return <>
        <style>{".member-row-disabled { opacity: 0.45; }"}</style>
        <Table
            rowKey="id"
            columns={columns}
            loading={isLoading}
            dataSource={data ?? []}
            rowClassName={(member) => member.role === "admin" ? "member-row-disabled" : ""}
            onRow={(member) => ({
                onClick: () => {
                    if (member.role === "admin") return;
                    setSelectedMember(member);
                },
                style: { cursor: member.role === "admin" ? "default" : "pointer" }
            })}
        />
        {selectedMember && (
            <EditMemberModal member={selectedMember} onClose={() => setSelectedMember(null)} />
        )}
    </>
}
