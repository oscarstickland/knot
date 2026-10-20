import { Button, Card, Empty, Typography } from "antd";
import { LinkOutlined } from "@ant-design/icons";
import type { OverviewDocuments } from "@knot/backend/event-overview";
import { describeLink } from "@/lib/documentLinks.ts";

const { Text } = Typography;

export function OverviewDocumentsCard({ documents, onOpenDocuments }: { documents: OverviewDocuments; onOpenDocuments: () => void }) {
    const hidden = documents.total - documents.recent.length;

    return <Card
        title="Documents"
        extra={<Button type="link" size="small" onClick={onOpenDocuments}>
            {hidden > 0 ? `View all ${documents.total}` : "Open"}
        </Button>}
    >
        {documents.recent.length === 0
            ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No links yet." />
            : <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                {documents.recent.map((document) => {
                    const link = describeLink(document.url);
                    return <li key={document.id} style={{ minWidth: 0 }}>
                        <a href={document.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 500 }}>
                            {document.title} <LinkOutlined aria-hidden style={{ fontSize: 12 }} />
                            <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}> (opens in a new tab)</span>
                        </a>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {link.provider ?? link.host} · {document.addedBy}
                        </Text>
                    </li>
                })}
            </ul>
        }
    </Card>
}
