import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect } from "bun:test";
import { type TestDatabaseHarness, setupHarness } from "../harness.ts";
import { eventDocumentsTable, eventsTable } from "../../db/schema.ts";
import type { EventDocument, EventDocumentWithUser } from "../../types/event-documents.ts";

type HTTPError = {
    message: string
}

describe("Event Documents Integration Test", () => {
    let harness: TestDatabaseHarness;

    beforeAll(async () => {
        harness = await setupHarness();
    }, 60000);

    afterAll(async () => {
        await harness.close();
    }, 60000);

    beforeEach(async () => {
        await harness.startTransaction();
    });

    afterEach(async () => {
        await harness.rollbackTransaction();
    });

    type App = Awaited<ReturnType<TestDatabaseHarness["setupApp"]>>;

    async function setupEvent(clubId: number) {
        const now = new Date();
        const [event] = await harness.db
            .insert(eventsTable)
            .values({
                name: "Event",
                location: "Main Hall",
                start: now,
                end: new Date(now.valueOf() + 5000),
                clubId
            })
            .returning();
        if (!event) throw new Error("Event returned is null");
        return event;
    }

    async function setupDocument(eventId: number, addedBy: number, title: string = "Run sheet", createdAt?: Date) {
        const [document] = await harness.db
            .insert(eventDocumentsTable)
            .values({ eventId, addedBy, title, url: "https://example.com/doc", ...(createdAt ? { createdAt } : {}) })
            .returning();
        if (!document) throw new Error("Document returned is null");
        return document;
    }

    function postDocument(app: App, eventId: number, cookie: string, body: unknown) {
        return app.request(`/api/events/${eventId}/documents`, {
            method: "POST",
            headers: { cookie },
            body: JSON.stringify(body)
        });
    }

    function putDocument(app: App, documentId: number, cookie: string, body: unknown) {
        return app.request(`/api/event-documents/${documentId}`, {
            method: "PUT",
            headers: { cookie },
            body: JSON.stringify(body)
        });
    }

    function deleteDocument(app: App, documentId: number, cookie: string) {
        return app.request(`/api/event-documents/${documentId}`, {
            method: "DELETE",
            headers: { cookie }
        });
    }

    describe("GET /api/events/:id/documents", () => {
        it("requires authentication", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);

            const res = await app.request(`/api/events/${event.id}/documents`);
            expect(res.status).toBe(401);
        });

        it("returns documents newest first with the name of who added them", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user, cookie } = await harness.setupUser("member@test.com", "standard", club.id, "Member Name");
            await setupDocument(event.id, user.id, "Older", new Date("2026-01-01T00:00:00Z"));
            await setupDocument(event.id, user.id, "Newer", new Date("2026-02-01T00:00:00Z"));

            const res = await app.request(`/api/events/${event.id}/documents`, { headers: { cookie } });
            expect(res.status).toBe(200);
            const body = await res.json() as EventDocumentWithUser[];
            expect(body.map((document) => document.title)).toEqual(["Newer", "Older"]);
            expect(body[0]!.addedByUser).toEqual({ id: user.id, name: "Member Name" });
        });

        it("only returns documents for the requested event", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const eventOne = await setupEvent(club.id);
            const eventTwo = await setupEvent(club.id);
            const { user, cookie } = await harness.setupUser("member@test.com", "standard", club.id, "User");
            await setupDocument(eventOne.id, user.id, "Mine");
            await setupDocument(eventTwo.id, user.id, "Other");

            const res = await app.request(`/api/events/${eventOne.id}/documents`, { headers: { cookie } });
            const body = await res.json() as EventDocumentWithUser[];
            expect(body.map((document) => document.title)).toEqual(["Mine"]);
        });

        it("returns 404 for an event in another club", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const otherClub = await harness.setupClub("Other Club");
            const otherEvent = await setupEvent(otherClub.id);
            const { cookie } = await harness.setupUser("member@test.com", "standard", club.id, "User");

            const res = await app.request(`/api/events/${otherEvent.id}/documents`, { headers: { cookie } });
            expect(res.status).toBe(404);
        });
    });

    describe("POST /api/events/:id/documents", () => {
        it.each(["standard", "exec", "admin"] as const)("allows a %s to add a link", async (role) => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user, cookie } = await harness.setupUser("actor@test.com", role, club.id, "User");

            const res = await postDocument(app, event.id, cookie, { title: "Run sheet", url: "https://example.com/run-sheet" });
            expect(res.status).toBe(201);
            const body = await res.json() as EventDocument;
            expect(body.title).toBe("Run sheet");
            expect(body.addedBy).toBe(user.id);

            const stored = await harness.db.query.eventDocumentsTable.findMany({ where: { eventId: event.id } });
            expect(stored.length).toBe(1);
            expect(stored[0]!.url).toBe("https://example.com/run-sheet");
        });

        it.each([
            ["a javascript: url", { title: "Bad", url: "javascript:alert(1)" }],
            ["a non-url", { title: "Bad", url: "nope" }],
            ["an empty title", { title: "", url: "https://example.com" }],
            ["a missing url", { title: "No url" }]
        ])("rejects %s with a 400", async (_label, payload) => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { cookie } = await harness.setupUser("member@test.com", "standard", club.id, "User");

            const res = await postDocument(app, event.id, cookie, payload);
            expect(res.status).toBe(400);
            expect((await res.json() as HTTPError).message).toBeTruthy();
            expect((await harness.db.query.eventDocumentsTable.findMany()).length).toBe(0);
        });

        it("returns 404 for an event in another club", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const otherClub = await harness.setupClub("Other Club");
            const otherEvent = await setupEvent(otherClub.id);
            const { cookie } = await harness.setupUser("member@test.com", "standard", club.id, "User");

            const res = await postDocument(app, otherEvent.id, cookie, { title: "Doc", url: "https://example.com" });
            expect(res.status).toBe(404);
            expect((await harness.db.query.eventDocumentsTable.findMany()).length).toBe(0);
        });

        it("requires authentication", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);

            const res = await app.request(`/api/events/${event.id}/documents`, {
                method: "POST",
                body: JSON.stringify({ title: "Doc", url: "https://example.com" })
            });
            expect(res.status).toBe(401);
        });
    });

    describe("PUT /api/event-documents/:id", () => {
        it("lets a member edit their own link", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user, cookie } = await harness.setupUser("member@test.com", "standard", club.id, "User");
            const document = await setupDocument(event.id, user.id);

            const res = await putDocument(app, document.id, cookie, { title: "Renamed", url: "https://example.com/new" });
            expect(res.status).toBe(200);

            const stored = await harness.db.query.eventDocumentsTable.findFirst({ where: { id: document.id } });
            expect(stored?.title).toBe("Renamed");
            expect(stored?.url).toBe("https://example.com/new");
            expect(stored?.addedBy).toBe(user.id);
        });

        it("hides another member's link from a standard member", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: owner } = await harness.setupUser("owner@test.com", "standard", club.id, "User");
            const { cookie } = await harness.setupUser("other@test.com", "standard", club.id, "User");
            const document = await setupDocument(event.id, owner.id, "Original");

            const res = await putDocument(app, document.id, cookie, { title: "Hijacked", url: "https://example.com" });
            expect(res.status).toBe(404);
            const stored = await harness.db.query.eventDocumentsTable.findFirst({ where: { id: document.id } });
            expect(stored?.title).toBe("Original");
        });

        it.each(["exec", "admin"] as const)("lets %s edit any link in their club", async (role) => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: owner } = await harness.setupUser("owner@test.com", "standard", club.id, "User");
            const { cookie } = await harness.setupUser("manager@test.com", role, club.id, "User");
            const document = await setupDocument(event.id, owner.id);

            const res = await putDocument(app, document.id, cookie, { title: "Managed", url: "https://example.com" });
            expect(res.status).toBe(200);
            const stored = await harness.db.query.eventDocumentsTable.findFirst({ where: { id: document.id } });
            expect(stored?.title).toBe("Managed");
            expect(stored?.addedBy).toBe(owner.id);
        });

        it("rejects an unsafe url with a 400", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user, cookie } = await harness.setupUser("member@test.com", "standard", club.id, "User");
            const document = await setupDocument(event.id, user.id);

            const res = await putDocument(app, document.id, cookie, { title: "Doc", url: "javascript:alert(1)" });
            expect(res.status).toBe(400);
        });

        it("hides links from another club, even from an admin", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const otherClub = await harness.setupClub("Other Club");
            const otherEvent = await setupEvent(otherClub.id);
            const { user: owner } = await harness.setupUser("owner@test.com", "standard", otherClub.id, "User");
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "User");
            const document = await setupDocument(otherEvent.id, owner.id);

            const res = await putDocument(app, document.id, cookie, { title: "Doc", url: "https://example.com" });
            expect(res.status).toBe(404);
        });
    });

    describe("DELETE /api/event-documents/:id", () => {
        it("lets a member delete their own link", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user, cookie } = await harness.setupUser("member@test.com", "standard", club.id, "User");
            const document = await setupDocument(event.id, user.id);

            const res = await deleteDocument(app, document.id, cookie);
            expect(res.status).toBe(200);
            expect((await harness.db.query.eventDocumentsTable.findMany()).length).toBe(0);
        });

        it("hides another member's link from a standard member", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: owner } = await harness.setupUser("owner@test.com", "standard", club.id, "User");
            const { cookie } = await harness.setupUser("other@test.com", "standard", club.id, "User");
            const document = await setupDocument(event.id, owner.id);

            const res = await deleteDocument(app, document.id, cookie);
            expect(res.status).toBe(404);
            expect((await harness.db.query.eventDocumentsTable.findMany()).length).toBe(1);
        });

        it.each(["exec", "admin"] as const)("lets %s delete any link in their club", async (role) => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const event = await setupEvent(club.id);
            const { user: owner } = await harness.setupUser("owner@test.com", "standard", club.id, "User");
            const { cookie } = await harness.setupUser("manager@test.com", role, club.id, "User");
            const document = await setupDocument(event.id, owner.id);

            const res = await deleteDocument(app, document.id, cookie);
            expect(res.status).toBe(200);
            expect((await harness.db.query.eventDocumentsTable.findMany()).length).toBe(0);
        });

        it("hides links from another club, even from an admin", async () => {
            const app = await harness.setupApp();
            const club = await harness.setupClub("Club");
            const otherClub = await harness.setupClub("Other Club");
            const otherEvent = await setupEvent(otherClub.id);
            const { user: owner } = await harness.setupUser("owner@test.com", "standard", otherClub.id, "User");
            const { cookie } = await harness.setupUser("admin@test.com", "admin", club.id, "User");
            const document = await setupDocument(otherEvent.id, owner.id);

            const res = await deleteDocument(app, document.id, cookie);
            expect(res.status).toBe(404);
            expect((await harness.db.query.eventDocumentsTable.findMany()).length).toBe(1);
        });
    });
});
