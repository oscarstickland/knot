import { z } from 'zod';
import {userRoles} from "../db/schema.ts";

export const CurrentUserSchema = z.object({
    id: z.number(),
    name: z.string(),
    email: z.email(),
    role: z.enum(userRoles)
});

export const JWTUserSchema = z.object({
    id: z.number(),
    email: z.email()
});

export const LoginFormSchema = z.object({
    email: z.email(),
    password: z.string().min(1, "Password of length 1 is required")
})

export type LoginFormData = z.infer<typeof LoginFormSchema>

export type CurrentUserData = z.infer<typeof CurrentUserSchema>;