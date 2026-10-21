import { describe, it, expect } from "bun:test";
import {
    CLUB_DELETE_GRACE_DAYS,
    ClubFormSchema,
    CreateAccountSchema,
    UpdateAccountSchema,
    clubDeletableAt
} from "../../types/super-admin.ts";

describe("clubDeletableAt", () => {
    it("is exactly the grace period after archiving", () => {
        const archivedAt = new Date("2026-10-01T00:00:00Z");
        const deletableAt = clubDeletableAt(archivedAt);
        expect(deletableAt.getTime() - archivedAt.getTime()).toBe(CLUB_DELETE_GRACE_DAYS * 24 * 60 * 60 * 1000);
    });

    it("does not mutate the archive date", () => {
        const archivedAt = new Date("2026-10-01T00:00:00Z");
        clubDeletableAt(archivedAt);
        expect(archivedAt.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    });
});

describe("ClubFormSchema", () => {
    it("trims the name", () => {
        expect(ClubFormSchema.parse({ name: "  Chess  " }).name).toBe("Chess");
    });

    it("rejects a blank name", () => {
        expect(ClubFormSchema.safeParse({ name: "   " }).success).toBe(false);
    });
});

describe("account schemas", () => {
    const base = { name: "Sam", email: "sam@test.com", role: "exec" as const };

    it("requires a password when creating", () => {
        expect(CreateAccountSchema.safeParse(base).success).toBe(false);
        expect(CreateAccountSchema.safeParse({ ...base, password: "password123" }).success).toBe(true);
    });

    it("makes the password optional when updating", () => {
        expect(UpdateAccountSchema.safeParse(base).success).toBe(true);
    });

    it("rejects short passwords", () => {
        expect(UpdateAccountSchema.safeParse({ ...base, password: "short" }).success).toBe(false);
    });

    it("cannot create another super admin", () => {
        expect(CreateAccountSchema.safeParse({ ...base, role: "superadmin", password: "password123" }).success).toBe(false);
    });
});
