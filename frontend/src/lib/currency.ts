export function formatCurrency(amount: number): string {
    return `${amount < 0 ? "-" : ""}$${Math.abs(amount).toFixed(2)}`;
}

// Money in minus money out; positive means the event is in surplus.
export function netPosition(totalIncome: number, totalSpent: number): number {
    return Math.round((totalIncome - totalSpent) * 100) / 100;
}
