import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect } from "bun:test";
import { type TestDatabaseHarness, setupHarness } from "../harness.ts";
import { sql } from "drizzle-orm";

describe("Database Integration Test", () => {
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

    it("creates an event", async () => {
        const app = await harness.setupApp();
        const club = await harness.setupClub("Club");
        const { cookie } = await harness.setupUser("test@test.com", "admin", club.id, "User");

        const res = await app.request("/api/events", {
            method: "POST",
            headers: { cookie },
            body: JSON.stringify({
                name: "Hello",
                start: new Date(),
                end: new Date(),
            })
        });

        expect(res.status).toBe(201);

        // TODO - check that it was actually inserted
    });

    it("prevents standard users from creating events", async () => {
        const app = await harness.setupApp();
        const club = await harness.setupClub("Club");
        const { cookie } = await harness.setupUser("test@test.com", "standard", club.id, "User");

        const res = await app.request("/api/events", {
            method: "POST",
            headers: { cookie },
            body: JSON.stringify({
                name: "Hello",
                start: new Date(),
                end: new Date(),
            })
        });
        expect(res.status).toBe(404);
    })
});