import type { eventAttendanceTable } from "../db/schema.ts";
import { z } from "zod";

export const RegisterAttendanceSchema = z.object({
    name: z.string().min(1, "Name cannot be empty"),
    email: z.string().email()
});

export const EventAttendanceInfoSchema = z.object({
    slug: z.string(),
    name: z.string(),
    start: z.coerce.date(),
    end: z.coerce.date(),
    attendanceOpen: z.boolean()
});

export const AttendanceSummarySchema = z.object({
    checkedIn: z.number().int().nonnegative(),
    lastCheckIn: z.coerce.date().nullable()
});

export const AttendanceCheckInSchema = z.object({
    id: z.number().int().positive(),
    name: z.string(),
    email: z.string().email(),
    createdAt: z.coerce.date()
});

export type RegisterAttendanceData = z.infer<typeof RegisterAttendanceSchema>;
export type EventAttendanceInfo = z.infer<typeof EventAttendanceInfoSchema>;
export type AttendanceSummary = z.infer<typeof AttendanceSummarySchema>;
export type AttendanceCheckIn = z.infer<typeof AttendanceCheckInSchema>;
export type EventAttendance = typeof eventAttendanceTable.$inferSelect;
