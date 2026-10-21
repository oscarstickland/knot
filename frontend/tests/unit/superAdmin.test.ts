import { describe, it, expect } from "bun:test";
import { canDeleteClub, clubStatus, daysUntilDeletable, platformTotals, type ClubSummary } from "../../src/lib/superAdmin";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-21T12:00:00Z");

function club(overrides: Partial<ClubSummary> = {}): ClubSummary {
    return { id: 1, name: "Club", archivedAt: null, deletableAt: null, memberCount: 0, activeMemberCount: 0, ...overrides };
}

describe("daysUntilDeletable", () => {
    it("is null for a club that is not archived", () => {
        expect(daysUntilDeletable(club(), now)).toBeNull();
    });

    it("rounds partial days up so the club is never shown as deletable early", () => {
        const deletableAt = new Date(now.getTime() + 2 * DAY_MS + 1000).toISOString();
        expect(daysUntilDeletable(club({ deletableAt }), now)).toBe(3);
    });

    it("is zero once the grace period has passed", () => {
        const deletableAt = new Date(now.getTime() - DAY_MS).toISOString();
        expect(daysUntilDeletable(club({ deletableAt }), now)).toBe(0);
    });
});

describe("canDeleteClub", () => {
    it("is false while active or inside the grace period", () => {
        expect(canDeleteClub(club(), now)).toBe(false);
        expect(canDeleteClub(club({ deletableAt: new Date(now.getTime() + DAY_MS).toISOString() }), now)).toBe(false);
    });

    it("is true when the grace period has elapsed", () => {
        expect(canDeleteClub(club({ deletableAt: now.toISOString() }), now)).toBe(true);
    });
});

describe("clubStatus", () => {
    it("reflects archivedAt", () => {
        expect(clubStatus(club())).toBe("active");
        expect(clubStatus(club({ archivedAt: now.toISOString() }))).toBe("archived");
    });
});

describe("platformTotals", () => {
    it("counts clubs by status and only counts accounts in active clubs", () => {
        const totals = platformTotals([
            club({ id: 1, activeMemberCount: 4, memberCount: 5 }),
            club({ id: 2, activeMemberCount: 2, memberCount: 2 }),
            club({ id: 3, activeMemberCount: 9, memberCount: 9, archivedAt: now.toISOString() })
        ]);
        expect(totals).toEqual({ activeClubs: 2, archivedClubs: 1, activeAccounts: 6 });
    });

    it("handles no clubs", () => {
        expect(platformTotals([])).toEqual({ activeClubs: 0, archivedClubs: 0, activeAccounts: 0 });
    });
});
