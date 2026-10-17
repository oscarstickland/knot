import type { eventDocumentsTable } from "../db/schema.ts";
import { z } from "zod";

// Plain z.string().url() accepts javascript: and data: URIs, which are unsafe to render as links.
const WebUrlSchema = z.string().trim().max(2048).url("Must be a valid URL").refine(
    (value) => {
        try {
            const { protocol } = new URL(value);
            return protocol === "http:" || protocol === "https:";
        } catch {
            return false;
        }
    },
    { message: "Link must start with http:// or https://" }
);

export const CreateEventDocumentSchema = z.object({
    title: z.string().trim().min(1, "Title cannot be empty").max(255),
    url: WebUrlSchema
});

export const UpdateEventDocumentSchema = CreateEventDocumentSchema;

export type CreateEventDocumentData = z.infer<typeof CreateEventDocumentSchema>;
export type UpdateEventDocumentData = z.infer<typeof UpdateEventDocumentSchema>;

export type EventDocument = typeof eventDocumentsTable.$inferSelect;

export type EventDocumentWithUser = EventDocument & {
    addedByUser: { id: number; name: string };
};
