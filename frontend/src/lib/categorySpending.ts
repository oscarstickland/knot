export const OTHER_SHARE_KEY = "__other__";
const DEFAULT_SHARE_LIMIT = 6;

export type SpendShare = {
    key: string;
    name: string;
    spent: number;
    // Percentage of total spend, 0-100.
    share: number;
};

type ShareSource = {
    key: string;
    name: string;
    totalSpent: number;
};

export function formatCurrency(amount: number): string {
    return `$${amount.toFixed(2)}`;
}

/**
 * Percentage of an allocation that has been spent, or null when nothing was allocated
 * (so there is no budget to measure against).
 */
export function percentUsed(spent: number, allocated: number): number | null {
    if (allocated <= 0) return null;
    return Math.round((spent / allocated) * 100);
}

/**
 * Each category's share of total spend, keeping the given order. Categories past `limit`
 * are merged into a single "Other" share so the breakdown stays readable.
 */
export function spendShares(categories: ShareSource[], limit: number = DEFAULT_SHARE_LIMIT): SpendShare[] {
    const spending = categories.filter((category) => category.totalSpent > 0);
    const totalSpent = spending.reduce((total, category) => total + category.totalSpent, 0);
    if (totalSpent === 0) return [];

    const toShare = (key: string, name: string, spent: number): SpendShare => ({
        key,
        name,
        spent,
        share: (spent / totalSpent) * 100
    });

    const shown = spending.slice(0, limit).map((category) => toShare(category.key, category.name, category.totalSpent));
    const rest = spending.slice(limit);
    if (rest.length === 0) return shown;

    const otherSpent = rest.reduce((total, category) => total + category.totalSpent, 0);
    return [...shown, toShare(OTHER_SHARE_KEY, "Other", otherSpent)];
}
