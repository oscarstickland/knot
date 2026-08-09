import type {eventsTable} from "../db/schema.ts";
import {z} from "zod";

const ClubEventSchema = z.object({
    name: z.string().min(1, "Event name cannot be empty"),
});

export const UpdateEventSchema = ClubEventSchema;

export type UpdateEventData = z.infer<typeof UpdateEventSchema>;
export type ClubEvent = typeof eventsTable.$inferSelect;