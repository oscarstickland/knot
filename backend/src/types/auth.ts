import { z } from 'zod';

export const CurrentUserSchema = z.object({
    id: z.number(),
    name: z.string(),
    email: z.email()
});

export const JWTUserSchema = z.object({
    id: z.number(),
    email: z.email()
});

export type CurrentUserData = z.infer<typeof CurrentUserSchema>;