import { useMemo, useState } from "react";
import {
    Button,
    Dropdown,
    Input,
    Popconfirm,
    Result,
    Space,
    Table,
    Tag,
    Typography,
    notification,
    type TableProps
} from "antd";
import { DeleteOutlined, DownloadOutlined, DownOutlined, SearchOutlined } from "@ant-design/icons";
import useSWR, { mutate } from "swr";
import type { ClubMember } from "@knot/backend/user";
import { AxiosInstance } from "@/lib/fetcher.tsx";
import { EditMemberModal } from "@/components/EditMemberModal.tsx";
import { CreateMemberModal } from "@/components/CreateMemberModal.tsx";
import { useAppNotification } from "@/lib/useAppNotification";

const { Text } = Typography;

const roleColor = (role: ClubMember["role"]) =>
    role === "admin" ? "red" : role === "exec" ? "blue" : "default";

const roleLabel = (role: ClubMember["role"]) => role.toUpperCase();

function exportMembersToCsv(members: ClubMember[]) {
    const escapeCsvCell = (cell: string) => `"${cell.replace(/"/g, '""')}"`;
    const header = ["Name", "Email", "Account Type"];
    const rows = members.map((member) => [member.name, member.email, roleLabel(member.role)]);

    const csv = [header, ...rows]
        .map((row) => row.map(escapeCsvCell).join(","))
        .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `members-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

export function ManageMembers() {
    return <>
        <div style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: "16px"
        }}>
            <Text type="secondary">Click a member to change their details</Text>
            <CreateMemberModal />
        </div>
        <MembersTable />
    </>
}

function MembersTable() {
    const { data, isLoading, error } = useSWR<ClubMember[]>("/user");
    const [selectedMember, setSelectedMember] = useState<ClubMember | null>(null);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [searchText, setSearchText] = useState("");
    const [api, contextHolder] = useAppNotification();

    const filteredData = useMemo(() => {
        const query = searchText.trim().toLowerCase();
        if (!query) return data ?? [];
        return (data ?? []).filter((member) =>
            member.name.toLowerCase().includes(query) || member.email.toLowerCase().includes(query)
        );
    }, [data, searchText]);

    const selectedMembers = useMemo(
        () => filteredData.filter((member) => selectedIds.includes(member.id)),
        [filteredData, selectedIds]
    );

    const bulkUpdateRole = (role: "standard" | "exec") => {
        AxiosInstance.patch("/user/bulk-role", { ids: selectedIds, role })
            .then(async () => {
                await mutate("/user");
                setSelectedIds([]);
                api["success"]({
                    title: "Success",
                    description: `Updated ${selectedIds.length} member(s) to ${roleLabel(role)}.`
                });
            })
            .catch((err) => {
                const message = err?.response?.data?.message ?? "Members could not be updated.";
                api["error"]({ title: "Error", description: message });
            });
    };

    const bulkDelete = () => {
        AxiosInstance.post("/user/bulk-delete", { ids: selectedIds })
            .then(async () => {
                await mutate("/user");
                setSelectedIds([]);
                api["success"]({
                    title: "Success",
                    description: `Deleted ${selectedIds.length} member(s).`
                });
            })
            .catch((err) => {
                const message = err?.response?.data?.message ?? "Members could not be deleted.";
                api["error"]({ title: "Error", description: message });
            });
    };

    const columns: TableProps<ClubMember>['columns'] = [
        {
            key: "name",
            title: "Name",
            dataIndex: "name",
            sorter: (a, b) => a.name.localeCompare(b.name)
        },
        {
            key: "email",
            title: "Email",
            dataIndex: "email",
            sorter: (a, b) => a.email.localeCompare(b.email)
        },
        {
            key: "role",
            title: "Account Type",
            dataIndex: "role",
            filters: [
                { text: "Standard", value: "standard" },
                { text: "Exec", value: "exec" },
                { text: "Admin", value: "admin" }
            ],
            onFilter: (value, member) => member.role === value,
            sorter: (a, b) => a.role.localeCompare(b.role),
            render: (role: ClubMember["role"]) => <Tag color={roleColor(role)}>{roleLabel(role)}</Tag>
        }
    ];

    if (error) {
        return <Result status="error" title="Retrieval Error" subTitle="Unable to fetch club members." />
    }

    return <>
        {contextHolder}
        <style>{".member-row-disabled { opacity: 0.45; }"}</style>
        <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            marginBottom: "12px"
        }}>
            <Input
                allowClear
                placeholder="Search by name or email"
                prefix={<SearchOutlined />}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{ maxWidth: 280 }}
            />
            <Space>
                {selectedIds.length > 0 && (
                    <>
                        <Dropdown
                            menu={{
                                items: [
                                    { key: "standard", label: "Set role to Standard" },
                                    { key: "exec", label: "Set role to Exec" }
                                ],
                                onClick: ({ key }) => bulkUpdateRole(key as "standard" | "exec")
                            }}
                        >
                            <Button>
                                Change Role <DownOutlined />
                            </Button>
                        </Dropdown>
                        <Popconfirm
                            title="Delete members"
                            description={`Are you sure you want to delete ${selectedIds.length} member(s)?`}
                            onConfirm={bulkDelete}
                            okText="Delete"
                            okButtonProps={{ danger: true }}
                        >
                            <Button danger icon={<DeleteOutlined />}>Delete ({selectedIds.length})</Button>
                        </Popconfirm>
                    </>
                )}
                <Button
                    icon={<DownloadOutlined />}
                    onClick={() => exportMembersToCsv(selectedMembers.length > 0 ? selectedMembers : filteredData)}
                >
                    Export CSV
                </Button>
            </Space>
        </div>
        <Table
            rowKey="id"
            columns={columns}
            loading={isLoading}
            dataSource={filteredData}
            rowClassName={(member) => member.role === "admin" ? "member-row-disabled" : ""}
            rowSelection={{
                selectedRowKeys: selectedIds,
                onChange: (keys) => setSelectedIds(keys as number[]),
                getCheckboxProps: (member) => ({ disabled: member.role === "admin" })
            }}
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
