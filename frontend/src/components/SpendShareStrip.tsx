import { Space, theme, Tooltip, Typography } from "antd";
import type { GlobalToken } from "antd";
import { formatCurrency, OTHER_SHARE_KEY, type SpendShare } from "@/lib/categorySpending.ts";
import { pluralise } from "@/lib/pluralise.ts";

const { Text } = Typography;

const STRIP_HEIGHT = 14;
const SEGMENT_GAP = 2;

// Reds are left out on purpose: red means over budget everywhere else on this page.
export function shareColours(token: GlobalToken): string[] {
    return [token.geekblue6, token.cyan6, token.gold6, token.purple6, token.green6, token.magenta6];
}

export function shareColour(token: GlobalToken, shares: SpendShare[], key: string): string {
    const index = shares.findIndex((share) => share.key === key);
    if (index === -1 || key === OTHER_SHARE_KEY) return token.colorTextQuaternary;
    return shareColours(token)[index % shareColours(token).length]!;
}

function formatShare(share: number): string {
    return share < 1 ? "<1%" : `${Math.round(share)}%`;
}

interface SpendShareStripProps {
    shares: SpendShare[];
    totalSpent: number;
    totalAllocated: number;
    categoryCount: number;
}

export function SpendShareStrip({ shares, totalSpent, totalAllocated, categoryCount }: SpendShareStripProps) {
    const { token } = theme.useToken();
    const isOverBudget = totalAllocated > 0 && totalSpent > totalAllocated;
    const description = shares.map((share) => `${share.name} ${formatShare(share.share)}`).join(", ");

    return <section aria-label="Share of spending by category" style={{ marginBottom: 24 }}>
        <p style={{ margin: 0, marginBottom: 12 }}>
            <Text strong style={{ fontSize: token.fontSizeHeading3, color: isOverBudget ? token.colorError : undefined }}>
                {formatCurrency(totalSpent)}
            </Text>
            <Text type="secondary" style={{ fontSize: token.fontSizeLG }}>
                {" "}spent of {formatCurrency(totalAllocated)} allocated across {pluralise(categoryCount, "category", "categories")}
            </Text>
        </p>

        {shares.length > 0 && <>
            <div
                className="spend-strip"
                role="img"
                aria-label={`Spending split: ${description}`}
                style={{
                    display: "flex",
                    gap: SEGMENT_GAP,
                    height: STRIP_HEIGHT,
                    borderRadius: token.borderRadiusSM,
                    overflow: "hidden"
                }}
            >
                {shares.map((share) => <Tooltip
                    key={share.key}
                    title={`${share.name}: ${formatCurrency(share.spent)} (${formatShare(share.share)})`}
                >
                    <div style={{
                        flexGrow: share.share,
                        flexBasis: 0,
                        minWidth: SEGMENT_GAP,
                        background: shareColour(token, shares, share.key)
                    }} />
                </Tooltip>)}
            </div>

            <Space wrap size={[16, 4]} style={{ marginTop: 8 }} aria-hidden>
                {shares.map((share) => <Space key={share.key} size={6}>
                    <ShareDot colour={shareColour(token, shares, share.key)} />
                    <Text>{share.name}</Text>
                    <Text type="secondary">{formatShare(share.share)}</Text>
                </Space>)}
            </Space>
        </>}
    </section>
}

export function ShareDot({ colour }: { colour: string }) {
    return <span style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: colour,
        flexShrink: 0
    }} />
}
