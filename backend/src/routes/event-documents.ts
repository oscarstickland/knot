import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { isAuthenticated, type UserEnv } from "../services/auth.ts";
import type { DbEnv } from "../db/connection.ts";
import { eventDocumentsTable } from "../db/schema.ts";
import { UpdateEventDocumentSchema } from "../types/event-documents.ts";
import { describeZodError } from "../types/errors.ts";

type Db = DbEnv["Variables"]["db"];

const eventDocumentsApp = new Hono<UserEnv & DbEnv>();
eventDocumentsApp.use("*", isAuthenticated);

function isExecOrAdmin(role: string): boolean {
    return role === "exec" || role === "admin";
}

// Execs and admins can manage any link in their club; standard members only their own.
// Returns null (treated as 404) for links the user can't touch, so their existence isn't leaked.
async function loadManageableDocument(db: Db, documentId: number, user: UserEnv["Variables"]["user"]) {
    const document = await db.query.eventDocumentsTable.findFirst({
        where: { id: documentId },
        with: { event: true }
    });

    if (!document || !document.event || document.event.clubId !== user.club.id) return null;
    if (!isExecOrAdmin(user.role) && document.addedBy !== user.id) return null;
    return document;
}

eventDocumentsApp.put("/:id{[0-9]+}", async (c) => {
    const user = c.var.user;
    const db = c.get("db");
    const documentId = Number(c.req.param("id"));

    const body = await c.req.json();
    const parsed = UpdateEventDocumentSchema.safeParse(body);
    if (!parsed.success) throw new HTTPException(400, { message: describeZodError(parsed.error) });

    const existing = await loadManageableDocument(db, documentId, user);
    if (!existing) throw new HTTPException(404, { message: "Document not found" });

    const [document] = await db
        .update(eventDocumentsTable)
        .set({ title: parsed.data.title, url: parsed.data.url })
        .where(eq(eventDocumentsTable.id, documentId))
        .returning();

    return c.json(document);
});

eventDocumentsApp.delete("/:id{[0-9]+}", async (c) => {
    const user = c.var.user;
    const db = c.get("db");
    const documentId = Number(c.req.param("id"));

    const existing = await loadManageableDocument(db, documentId, user);
    if (!existing) throw new HTTPException(404, { message: "Document not found" });

    await db.delete(eventDocumentsTable).where(eq(eventDocumentsTable.id, documentId));

    return c.json({ message: "Deleted" });
});

export { eventDocumentsApp };
