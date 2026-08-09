import type {eventsTable} from "../db/schema.ts";

export type ClubEvent = typeof eventsTable.$inferSelect;