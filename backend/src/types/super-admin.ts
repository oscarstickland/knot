import { z } from "zod";
import type { UserRole, usersTable } from "../db/schema.ts";

// Archived clubs can only be deleted for good once they have been archived this long.
export const CLUB_DELETE_GRACE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export function clubDeletableAt(archivedAt: Date): Date {
    return new Date(archivedAt.getTime() + CLUB_DELETE_GRACE_DAYS * DAY_MS);
}

export const ClubFormSchema = z.object({
    name: z.string().trim().min(1, "Club name cannot be empty").max(255, "Club name is too long")
});

export type ClubFormData = z.infer<typeof ClubFormSchema>;

const accountRoles = ["standard", "exec", "admin"] as const;

export const UpdateAccountSchema = z.object({
    name: z.string().trim().min(1, "Name cannot be empty").max(255),
    email: z.email(),
    role: z.enum(accountRoles),
    password: z.string().min(8, "Password must be at least 8 characters").optional()
});

export const CreateAccountSchema = UpdateAccountSchema.extend({
    password: z.string().min(8, "Password must be at least 8 characters")
});

export type UpdateAccountData = z.infer<typeof UpdateAccountSchema>;
export type CreateAccountData = z.infer<typeof CreateAccountSchema>;

export interface SuperAdminClub {
    id: number;
    name: string;
    archivedAt: Date | null;
    // Null while the club is active.
    deletableAt: Date | null;
    activeMemberCount: number;
    memberCount: number;
}

export type ClubAccount = Omit<typeof usersTable.$inferSelect, "password" | "role" | "clubId"> & {
    role: UserRole;
    clubId: number;
};
