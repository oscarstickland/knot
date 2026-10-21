import type { SuperAdminClub, ClubAccount } from "@knot/backend/super-admin";

const DAY_MS = 24 * 60 * 60 * 1000;

// JSON turns the backend's Date fields into ISO strings.
type Serialized<T> = { [K in keyof T]: T[K] extends Date | null ? string | null : T[K] };
export type ClubSummary = Serialized<SuperAdminClub>;
export type Account = ClubAccount;

export type ClubStatus = "active" | "archived";

export function clubStatus(club: Pick<ClubSummary, "archivedAt">): ClubStatus {
    return club.archivedAt ? "archived" : "active";
}

// Whole days left until an archived club can be deleted for good. Zero means it can be deleted now;
// null means the club is not archived.
export function daysUntilDeletable(club: Pick<ClubSummary, "deletableAt">, now: Date = new Date()): number | null {
    if (!club.deletableAt) return null;
    const remaining = new Date(club.deletableAt).getTime() - now.getTime();
    return Math.max(0, Math.ceil(remaining / DAY_MS));
}

export function canDeleteClub(club: Pick<ClubSummary, "deletableAt">, now: Date = new Date()): boolean {
    return daysUntilDeletable(club, now) === 0;
}

export interface PlatformTotals {
    activeClubs: number;
    archivedClubs: number;
    activeAccounts: number;
}

export function platformTotals(clubs: readonly ClubSummary[]): PlatformTotals {
    return clubs.reduce<PlatformTotals>((totals, club) => ({
        activeClubs: totals.activeClubs + (club.archivedAt ? 0 : 1),
        archivedClubs: totals.archivedClubs + (club.archivedAt ? 1 : 0),
        activeAccounts: totals.activeAccounts + (club.archivedAt ? 0 : club.activeMemberCount)
    }), { activeClubs: 0, archivedClubs: 0, activeAccounts: 0 });
}
