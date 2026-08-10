import type { usersTable } from "../db/schema.ts";

export type ClubMember = Omit<typeof usersTable.$inferSelect, "password">;
