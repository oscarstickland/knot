import type { usersTable } from "../db/schema.ts";
import { z } from "zod";

export type ClubMember = Omit<typeof usersTable.$inferSelect, "password">;

export const UpdateMemberSchema = z.object({
    name: z.string().min(1, "Name cannot be empty"),
    email: z.email(),
    role: z.enum(["standard", "exec"]),
    password: z.string().min(8, "Password must be at least 8 characters").optional()
});

export type UpdateMemberData = z.infer<typeof UpdateMemberSchema>;

export const CreateMemberSchema = UpdateMemberSchema.extend({
    password: z.string().min(8, "Password must be at least 8 characters")
});

export type CreateMemberData = z.infer<typeof CreateMemberSchema>;

export const BulkRoleUpdateSchema = z.object({
    ids: z.array(z.number().int()).min(1, "Select at least one member"),
    role: z.enum(["standard", "exec"])
});

export type BulkRoleUpdateData = z.infer<typeof BulkRoleUpdateSchema>;

export const BulkDeleteSchema = z.object({
    ids: z.array(z.number().int()).min(1, "Select at least one member")
});

export type BulkDeleteData = z.infer<typeof BulkDeleteSchema>;
