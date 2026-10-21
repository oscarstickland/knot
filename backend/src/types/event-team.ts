import type { UserRole } from "../db/schema.ts";
import { z } from "zod";

export const SetEventTeamSchema = z.object({
    userIds: z.array(z.number().int().positive()).max(500)
        .transform((ids) => [...new Set(ids)]),
    // Left out, visibility is unchanged.
    teamWide: z.boolean().optional()
});

export type SetEventTeamData = z.infer<typeof SetEventTeamSchema>;

export type EventTeamMember = {
    id: number;
    name: string;
    role: UserRole;
};
