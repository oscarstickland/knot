import type { eventsTable } from "../db/schema.ts";
import { z } from "zod";

const ClubEventSchema = z.object({
    name: z.string().min(1, "Event name cannot be empty"),
    start: z.string().datetime({ offset: true }).pipe(z.coerce.date()),
    end: z.string().datetime({ offset: true }).pipe(z.coerce.date()),
    expectedAttendees: z.union([z.literal(""), z.null(), z.coerce.number().int().positive()])
        .optional()
        .transform((value) => (value === "" || value === undefined || value === null ? null : value))
}).refine((data) => data.start < data.end, {
    message: "Event must start before it ends",
    path: ["end"]
});

export const UpdateEventSchema = ClubEventSchema;

export const ArchiveEventSchema = z.object({
    archived: z.boolean()
});

export type UpdateEventData = z.infer<typeof UpdateEventSchema>;
export type ArchiveEventData = z.infer<typeof ArchiveEventSchema>;
export type ClubEvent = typeof eventsTable.$inferSelect;