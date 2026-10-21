import { useMemo, useState } from "react";
import { Button, Input, Layout, Result, Table, Tag, theme, Typography, type TableProps } from "antd";
import { PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router";
import useSWR from "swr";
import { ClubFormModal } from "@/components/super-admin/ClubFormModal";
import { clubStatus, daysUntilDeletable, platformTotals, type ClubSummary } from "@/lib/superAdmin";
import { pluralise } from "@/lib/pluralise";

const { Title, Text } = Typography;

export function ClubsPage() {
    const { token } = theme.useToken();
    const navigate = useNavigate();
    const { data, isLoading, error } = useSWR<ClubSummary[]>("/super-admin/clubs");
    const [creating, setCreating] = useState(false);
    const [searchText, setSearchText] = useState("");

    const filtered = useMemo(() => {
        const query = searchText.trim().toLowerCase();
        return (data ?? []).filter((club) => !query || club.name.toLowerCase().includes(query));
    }, [data, searchText]);

    const columns: TableProps<ClubSummary>["columns"] = [
        {
            key: "name",
            title: "Club",
            dataIndex: "name",
            sorter: (a, b) => a.name.localeCompare(b.name),
            render: (name: string, club) => <Text strong style={{ opacity: club.archivedAt ? 0.6 : 1 }}>{name}</Text>
        },
        {
            key: "status",
            title: "Status",
            filters: [{ text: "Active", value: "active" }, { text: "Archived", value: "archived" }],
            onFilter: (value, club) => clubStatus(club) === value,
            render: (_, club) => clubStatus(club) === "active"
                ? <Tag color="green">ACTIVE</Tag>
                : <Tag>{deletionLabel(club)}</Tag>
        },
        {
            key: "members",
            title: "Accounts",
            align: "right",
            sorter: (a, b) => a.activeMemberCount - b.activeMemberCount,
            render: (_, club) => <Text>
                {club.activeMemberCount}
                {club.memberCount > club.activeMemberCount && <Text type="secondary"> / {club.memberCount}</Text>}
            </Text>
        }
    ];

    if (error) {
        return <Layout style={{ padding: "24px" }}>
            <Result status="error" title="Retrieval Error" subTitle="Something went wrong loading the clubs. Try refreshing the page." />
        </Layout>;
    }

    const totals = platformTotals(data ?? []);

    return <Layout style={{ padding: "24px 24px", background: "transparent" }}>
        <Layout style={{ padding: 24, background: token.colorBgContainer, borderRadius: token.borderRadiusLG }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
                <div>
                    <Title level={2} style={{ margin: 0 }}>Clubs</Title>
                    <Text type="secondary">Every club on the platform. Select one to manage its accounts.</Text>
                </div>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>New Club</Button>
            </div>

            <dl style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                margin: "0 0 24px",
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: token.borderRadiusLG
            }}>
                <Stat label="Active clubs" value={totals.activeClubs} first />
                <Stat label="Active accounts" value={totals.activeAccounts} />
                <Stat label="Archived clubs" value={totals.archivedClubs} muted />
            </dl>

            <Input
                allowClear
                placeholder="Search clubs"
                prefix={<SearchOutlined />}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{ maxWidth: 280, marginBottom: 12 }}
            />
            <Table
                rowKey="id"
                columns={columns}
                loading={isLoading}
                dataSource={filtered}
                pagination={{ pageSize: 15, hideOnSinglePage: true }}
                onRow={(club) => ({
                    onClick: () => navigate(`/super/clubs/${club.id}`),
                    style: { cursor: "pointer" }
                })}
                locale={{ emptyText: data?.length === 0 ? "No clubs yet. Create the first one." : "No clubs match your search." }}
            />
        </Layout>
        <ClubFormModal open={creating} onClose={() => setCreating(false)} />
    </Layout>;
}

function deletionLabel(club: ClubSummary) {
    const days = daysUntilDeletable(club);
    if (days === null) return "ARCHIVED";
    return days === 0 ? "ARCHIVED · CAN DELETE" : `ARCHIVED · ${pluralise(days, "day")} to delete`;
}

function Stat(props: { label: string; value: number; first?: boolean; muted?: boolean }) {
    const { token } = theme.useToken();

    return <div style={{
        padding: "16px 20px",
        borderLeft: props.first ? "none" : `1px solid ${token.colorBorderSecondary}`
    }}>
        <dt style={{ color: token.colorTextSecondary, fontSize: 13 }}>{props.label}</dt>
        <dd style={{
            margin: 0,
            fontSize: 32,
            lineHeight: 1.2,
            fontWeight: 600,
            fontVariantNumeric: "tabular-nums",
            color: props.muted ? token.colorTextTertiary : token.colorText
        }}>
            {props.value}
        </dd>
    </div>;
}
