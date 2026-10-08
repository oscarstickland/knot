import { describe, it, expect } from "bun:test";
import { CreateEventDocumentSchema } from "../../types/event-documents.ts";

describe("CreateEventDocumentSchema", () => {
    it.each(["https://docs.google.com/document/d/abc", "http://example.com/file.pdf"])("accepts %s", (url) => {
        expect(CreateEventDocumentSchema.safeParse({ title: "Doc", url }).success).toBe(true);
    });

    it.each(["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "ftp://example.com/file", "not a url", ""])(
        "rejects %p as a url",
        (url) => {
            expect(CreateEventDocumentSchema.safeParse({ title: "Doc", url }).success).toBe(false);
        }
    );

    it("rejects an empty or whitespace-only title", () => {
        expect(CreateEventDocumentSchema.safeParse({ title: "   ", url: "https://example.com" }).success).toBe(false);
    });

    it("trims the title", () => {
        const result = CreateEventDocumentSchema.parse({ title: "  Run sheet ", url: "https://example.com" });
        expect(result.title).toBe("Run sheet");
    });

    it("rejects urls longer than 2048 characters", () => {
        const url = `https://example.com/${"a".repeat(2048)}`;
        expect(CreateEventDocumentSchema.safeParse({ title: "Doc", url }).success).toBe(false);
    });
});
