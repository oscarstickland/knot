import { Button, Card, ConfigProvider, Table, Typography, theme, type TableProps } from "antd";
import type { BudgetLine, OverviewBudget } from "@knot/backend/event-overview";
import { formatCurrency } from "@/lib/currency.ts";
import { formatSignedCurrency } from "@/lib/eventOverview.ts";

const { Text } = Typography;

type Row = BudgetLine & { key: string; direction: "in" | "out" | "net" };

export function FinancialsCard({ budget, onOpenBudget }: { budget: OverviewBudget; onOpenBudget: () => void }) {
    const { token } = theme.useToken();
    const rows: Row[] = [
        ...budget.incomeLines.map((line): Row => ({ ...line, key: `in-${line.label}`, direction: "in" })),
        ...budget.expenseLines.map((line): Row => ({ ...line, key: `out-${line.label}`, direction: "out" })),
        { key: "net", label: "Net position", amount: budget.net, direction: "net" }
    ];

    const columns: TableProps<Row>["columns"] = [
        {
            key: "line",
            title: "Line",
            render: (_, row) => row.direction === "net" ? <Text strong>{row.label}</Text> : row.label
        },
        {
            key: "amount",
            title: "Amount",
            align: "right",
            render: (_, row) => {
                if (row.direction === "net") {
                    return <Text strong style={{ color: row.amount < 0 ? token.colorError : token.colorSuccess }}>{formatSignedCurrency(row.amount)}</Text>
                }
                return row.direction === "in"
                    ? <Text style={{ color: token.colorSuccess }}>+{formatCurrency(row.amount)}</Text>
                    : <Text>-{formatCurrency(row.amount)}</Text>
            }
        }
    ];

    return <Card
        title="Financials"
        extra={<Button type="link" size="small" onClick={onOpenBudget}>Open in Budget</Button>}
        styles={{ body: { padding: 0 } }}
    >
        <ConfigProvider theme={{ components: { Table: { headerBorderRadius: 0 } } }}>
            <Table
                rowKey="key"
                size="middle"
                dataSource={rows}
                columns={columns}
                pagination={false}
                showHeader
                rowClassName={(row) => row.direction === "net" ? "overview-net-row" : ""}
                onRow={(row) => row.direction === "net" ? { style: { background: row.amount < 0 ? token.colorErrorBg : token.colorSuccessBg } } : {}}
            />
        </ConfigProvider>
    </Card>
}
