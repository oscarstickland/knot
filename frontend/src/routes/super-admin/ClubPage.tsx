import { useMemo, useState } from "react";
import { Alert, Breadcrumb, Button, Input, Layout, Modal, Popconfirm, Result, Space, Table, Tag, theme, Typography, type TableProps } from "antd";
import { DeleteOutlined, EditOutlined, InboxOutlined, PlusOutlined, SearchOutlined, UndoOutlined } from "@ant-design/icons";
import { Link, useNavigate, useParams } from "react-router";
import useSWR, { mutate } from "swr";
import { AccountModal } from "@/components/super-admin/AccountModal";
import { ClubFormModal } from "@/components/super-admin/ClubFormModal";
import { AxiosInstance } from "@/lib/fetcher";
import { useAppNotification } from "@/lib/useAppNotification";
import { canDeleteClub, clubStatus, daysUntilDeletable, type Account, type ClubSummary } from "@/lib/superAdmin";
import { pluralise } from "@/lib/pluralise";

const { Title, Text } = Typography;

const roleColor = (role: Account["role"]) => role === "admin" ? "red" : role === "exec" ? "blue" : "default";

export function ClubPage() {
    const { token } = theme.useToken();
    const { id } = useParams();
    const clubKey = `/super-admin/clubs/${id}`;
    const club = useSWR<ClubSummary>(clubKey);
    const [renaming, setRenaming] = useState(false);

    if (club.error) {
        const notFound = club.error?.response?.status === 404;
        return <Layout style={{ padding: "24px" }}>
            <Result
                status={notFound ? "404" : "error"}
                title={notFound ? "Club not found" : "Retrieval Error"}
                subTitle={notFound ? "It may have been deleted." : "Something went wrong loading this club. Try refreshing the page."}
                extra={<Link to="/super"><Button>Back to clubs</Button></Link>}
            />
        </Layout>;
    }

    return <Layout style={{ padding: "24px 24px", background: "transparent" }}>
        <Layout style={{ padding: 24, background: token.colorBgContainer, borderRadius: token.borderRadiusLG }}>
            <Breadcrumb
                style={{ marginBottom: 16 }}
                items={[{ title: <Link to="/super">Clubs</Link> }, { title: club.data?.name ?? "…" }]}
            />
            {club.data && <>
                <ClubHeader club={club.data} onRename={() => setRenaming(true)} />
                <ArchiveNotice club={club.data} />
                <Title level={4} style={{ margin: "8px 0 16px" }}>Accounts</Title>
                <AccountsTable club={club.data} />
                <ClubFormModal club={club.data} open={renaming} onClose={() => setRenaming(false)} />
            </>}
        </Layout>
    </Layout>;
}

function ClubHeader({ club, onRename }: { club: ClubSummary, onRename: () => void }) {
    const navigate = useNavigate();
    const [api, contextHolder] = useAppNotification();
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [typedName, setTypedName] = useState("");
    const isArchived = clubStatus(club) === "archived";

    const refresh = () => Promise.all([mutate(`/super-admin/clubs/${club.id}`), mutate("/super-admin/clubs")]);

    const changeArchive = (action: "archive" | "restore") =>
        AxiosInstance.post(`/super-admin/clubs/${club.id}/${action}`)
            .then(async () => {
                await refresh();
                api["success"]({
                    title: "Success",
                    description: action === "archive" ? `${club.name} has been archived.` : `${club.name} has been restored.`
                });
            })
            .catch((error) => api["error"]({
                title: "Error",
                description: error?.response?.data?.message ?? `Club could not be ${action}d.`
            }));

    const deleteForever = () =>
        AxiosInstance.delete(`/super-admin/clubs/${club.id}`)
            .then(async () => {
                await mutate("/super-admin/clubs");
                navigate("/super");
            })
            .catch((error) => api["error"]({
                title: "Error",
                description: error?.response?.data?.message ?? "Club could not be deleted."
            }));

    return <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
        {contextHolder}
        <div>
            <Space align="center" size="middle">
                <Title level={2} style={{ margin: 0 }}>{club.name}</Title>
                {isArchived ? <Tag>ARCHIVED</Tag> : <Tag color="green">ACTIVE</Tag>}
            </Space>
            <div><Text type="secondary">{pluralise(club.activeMemberCount, "active account")}</Text></div>
        </div>
        <Space wrap>
            <Button icon={<EditOutlined />} onClick={onRename}>Rename</Button>
            {isArchived
                ? <Button icon={<UndoOutlined />} onClick={() => changeArchive("restore")}>Restore</Button>
                : <Popconfirm
                    title="Archive club"
                    description="Members will be logged out and won't be able to sign in. You can restore the club at any time."
                    onConfirm={() => changeArchive("archive")}
                    okText="Archive"
                    okButtonProps={{ danger: true }}
                >
                    <Button danger icon={<InboxOutlined />}>Archive</Button>
                </Popconfirm>}
            {isArchived && <Button
                danger
                type="primary"
                icon={<DeleteOutlined />}
                disabled={!canDeleteClub(club)}
                onClick={() => setConfirmingDelete(true)}
            >
                Delete forever
            </Button>}
        </Space>
        <Modal
            open={confirmingDelete}
            title="Delete club forever"
            centered
            destroyOnHidden
            okText="Delete forever"
            okButtonProps={{ danger: true, disabled: typedName !== club.name }}
            onOk={deleteForever}
            onCancel={() => { setConfirmingDelete(false); setTypedName(""); }}
        >
            <Alert
                type="error"
                showIcon
                style={{ marginBottom: 16 }}
                title="This permanently deletes the club's accounts, events, tasks, budgets and attendance. It cannot be undone."
            />
            <Text>Type <Text strong code>{club.name}</Text> to confirm.</Text>
            <Input style={{ marginTop: 8 }} value={typedName} onChange={(e) => setTypedName(e.target.value)} aria-label="Club name confirmation" />
        </Modal>
    </div>;
}

function ArchiveNotice({ club }: { club: ClubSummary }) {
    const days = daysUntilDeletable(club);
    if (days === null) return null;

    return <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        title={days === 0
            ? "This club has been archived long enough to be deleted permanently."
            : `Members can't sign in. This club can be deleted permanently in ${pluralise(days, "day")}.`}
    />;
}

function AccountsTable({ club }: { club: ClubSummary }) {
    const { data, isLoading, error } = useSWR<Account[]>(`/super-admin/clubs/${club.id}/users`);
    const [editing, setEditing] = useState<Account | null>(null);
    const [creating, setCreating] = useState(false);
    const [searchText, setSearchText] = useState("");

    const filtered = useMemo(() => {
        const query = searchText.trim().toLowerCase();
        return (data ?? []).filter((account) =>
            !query || account.name.toLowerCase().includes(query) || account.email.toLowerCase().includes(query)
        );
    }, [data, searchText]);

    const columns: TableProps<Account>["columns"] = [
        { key: "name", title: "Name", dataIndex: "name", sorter: (a, b) => a.name.localeCompare(b.name) },
        { key: "email", title: "Email", dataIndex: "email", sorter: (a, b) => a.email.localeCompare(b.email) },
        {
            key: "role",
            title: "Account Type",
            dataIndex: "role",
            filters: [
                { text: "Standard", value: "standard" },
                { text: "Exec", value: "exec" },
                { text: "Admin", value: "admin" }
            ],
            onFilter: (value, account) => account.role === value,
            render: (role: Account["role"]) => <Tag color={roleColor(role)}>{role.toUpperCase()}</Tag>
        },
        {
            key: "status",
            title: "Status",
            dataIndex: "status",
            filters: [{ text: "Active", value: "active" }, { text: "Offboarded", value: "offboarded" }],
            onFilter: (value, account) => account.status === value,
            render: (status: Account["status"]) => <Tag color={status === "active" ? "green" : "default"}>{status.toUpperCase()}</Tag>
        }
    ];

    if (error) {
        return <Result status="error" title="Retrieval Error" subTitle="Something went wrong loading the accounts. Try refreshing the page." />;
    }

    return <>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
            <Input
                allowClear
                placeholder="Search by name or email"
                prefix={<SearchOutlined />}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{ maxWidth: 280 }}
            />
            <Button icon={<PlusOutlined />} onClick={() => setCreating(true)}>New Account</Button>
        </div>
        <Table
            rowKey="id"
            columns={columns}
            loading={isLoading}
            dataSource={filtered}
            rowClassName={(account) => account.status === "offboarded" ? "member-row-disabled" : ""}
            onRow={(account) => ({ onClick: () => setEditing(account), style: { cursor: "pointer" } })}
            locale={{ emptyText: data?.length === 0 ? "No accounts yet. Add the club's first admin." : "No accounts match your search." }}
        />
        <style>{".member-row-disabled { opacity: 0.45; }"}</style>
        <AccountModal clubId={club.id} open={creating} onClose={() => setCreating(false)} />
        {editing && <AccountModal clubId={club.id} account={editing} open onClose={() => setEditing(null)} />}
    </>;
}
