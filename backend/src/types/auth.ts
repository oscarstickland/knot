import { z } from 'zod';
import {userRoles} from "../db/schema.ts";

export const CurrentUserSchema = z.object({
    id: z.number(),
    name: z.string(),
    email: z.email(),
    role: z.enum(userRoles),
    club: z.object({
        id: z.number(),
        name: z.string(),
    })
});

export const SuperAdminUserSchema = z.object({
    id: z.number(),
    name: z.string(),
    email: z.email(),
    role: z.literal("superadmin"),
    club: z.null()
});

// What /user/me and login return: a club member or a platform super admin.
export const SessionUserSchema = z.union([CurrentUserSchema, SuperAdminUserSchema]);

export const JWTUserSchema = z.object({
    id: z.number(),
    email: z.email()
});

export const LoginFormSchema = z.object({
    email: z.email(),
    password: z.string().min(1, "Password of length 1 is required")
})

export type JWTUserData = z.infer<typeof JWTUserSchema>;
export type LoginFormData = z.infer<typeof LoginFormSchema>
export type CurrentUserData = z.infer<typeof CurrentUserSchema>;
export type SuperAdminUserData = z.infer<typeof SuperAdminUserSchema>;
export type SessionUserData = z.infer<typeof SessionUserSchema>;
