import type { eventAttendanceTable } from "../db/schema.ts";
import { z } from "zod";

export const RegisterAttendanceSchema = z.object({
    name: z.string().min(1, "Name cannot be empty"),
    email: z.string().email()
});

export type RegisterAttendanceData = z.infer<typeof RegisterAttendanceSchema>;
export type EventAttendance = typeof eventAttendanceTable.$inferSelect;
