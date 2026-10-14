import type { eventsTable } from "../db/schema.ts";
import { z } from "zod";

const ClubEventFields = z.object({
    name: z.string().min(1, "Event name cannot be empty"),
    location: z.string().min(1, "Location cannot be empty").max(255, "Location must be at most 255 characters"),
    start: z.string().datetime({ offset: true }).pipe(z.coerce.date()),
    end: z.string().datetime({ offset: true }).pipe(z.coerce.date()),
    expectedAttendees: z.union([z.literal(""), z.null(), z.coerce.number().int().positive()])
        .optional()
        .transform((value) => (value === "" || value === undefined || value === null ? null : value))
});

const startsBeforeEnd = {
    check: (data: { start: Date; end: Date }) => data.start < data.end,
    params: { message: "Event must start before it ends", path: ["end"] }
};

export const UpdateEventSchema = ClubEventFields.refine(startsBeforeEnd.check, startsBeforeEnd.params);

// Details for the new event, plus which of the source event's contents to carry over
export const DuplicateEventSchema = ClubEventFields.extend({
    includeTasks: z.boolean().default(false),
    includeBudget: z.boolean().default(false)
}).refine(startsBeforeEnd.check, startsBeforeEnd.params);

export const ArchiveEventSchema = z.object({
    archived: z.boolean()
});

export const SetAttendanceOpenSchema = z.object({
    attendanceOpen: z.boolean()
});

export type UpdateEventData = z.infer<typeof UpdateEventSchema>;
export type DuplicateEventData = z.infer<typeof DuplicateEventSchema>;
export type ArchiveEventData = z.infer<typeof ArchiveEventSchema>;
export type SetAttendanceOpenData = z.infer<typeof SetAttendanceOpenSchema>;
export type ClubEvent = typeof eventsTable.$inferSelect;

export type EventTaskProgress = {
    total: number;
    completed: number;
};

export type ClubEventWithTaskProgress = ClubEvent & {
    taskProgress: EventTaskProgress;
};