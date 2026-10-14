import { Avatar, Empty, List, Result, Typography, theme } from "antd";
import { LinkOutlined } from "@ant-design/icons";
import useSWR from "swr";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import type { EventDocumentWithUser } from "@knot/backend/event-documents";
import { useUser } from "@/lib/auth.tsx";
import { describeLink, type LinkTone } from "@/lib/documentLinks.ts";
import { pluralise } from "@/lib/pluralise.ts";
import { DocumentModal } from "@/components/DocumentModal.tsx";

dayjs.extend(relativeTime);

const { Text } = Typography;

function useToneColors(tone: LinkTone) {
    const { token } = theme.useToken();
    switch (tone) {
        case "blue": return { background: token.blue1, color: token.blue7 };
        case "green": return { background: token.green1, color: token.green7 };
        case "gold": return { background: token.gold1, color: token.gold7 };
        default: return { background: token.colorFillTertiary, color: token.colorTextSecondary };
    }
}

function LinkTile(props: { initial: string; tone: LinkTone }) {
    const colors = useToneColors(props.tone);
    return <Avatar shape="square" size={44} aria-hidden style={{ ...colors, fontWeight: 600, fontSize: 18, flexShrink: 0 }}>
        {props.initial}
    </Avatar>
}

function DocumentRow(props: { eventId: number; document: EventDocumentWithUser }) {
    const { token } = theme.useToken();
    const user = useUser();
    const { document } = props;
    const link = describeLink(document.url);
    const canManage = user.role === "admin" || user.role === "exec" || document.addedBy === user.id;

    return <List.Item
        className="document-row"
        style={{ gap: 16, paddingInline: 4 }}
        actions={canManage ? [
            <span key="manage" className="document-actions">
                <DocumentModal mode="update" eventId={props.eventId} document={document} />
            </span>
        ] : undefined}
    >
        <List.Item.Meta
            avatar={<LinkTile initial={link.initial} tone={link.tone} />}
            title={
                <a
                    className="document-title"
                    href={document.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontWeight: 600 }}
                >
                    {document.title} <LinkOutlined aria-hidden style={{ fontSize: 12, color: token.colorTextTertiary }} />
                    <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}> (opens in a new tab)</span>
                </a>
            }
            description={<>
                <Text type="secondary" style={{ fontFamily: token.fontFamilyCode, fontSize: 12 }}>
                    {link.provider ? `${link.provider} · ` : ""}{link.host}
                </Text>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>
                    Added by {document.addedByUser.name} · {dayjs(document.createdAt).fromNow()}
                </Text>
            </>}
        />
    </List.Item>
}

export function DocumentsSection(props: { eventId: number }) {
    const { data, isLoading, error } = useSWR<EventDocumentWithUser[]>(`/events/${props.eventId}/documents`);

    if (error) {
        return <Result status="error" title="Retrieval Error" subTitle="Unable to fetch documents." />
    }

    const documents = data ?? [];

    return <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <Text strong>{data ? pluralise(documents.length, "Document") : "Documents"}</Text>
            <DocumentModal mode="create" eventId={props.eventId} />
        </div>
        <List
            loading={isLoading}
            dataSource={documents}
            renderItem={(document) => <DocumentRow eventId={props.eventId} document={document} />}
            locale={{ emptyText: <Empty description="No links yet. Add a run sheet, roster or booking confirmation." image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        />
    </div>
}
