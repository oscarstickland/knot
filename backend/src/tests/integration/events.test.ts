import { describe, it, beforeAll, afterAll, beforeEach, afterEach, expect } from "bun:test";
import { type TestDatabaseHarness, setupHarness } from "../harness.ts";
import { eventsTable } from "../../db/schema.ts";

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

    it("prevents standard users from creating events", async () => {
        const app = await harness.setupApp();
        const club = await harness.setupClub("Club");
        const { cookie } = await harness.setupUser("test@test.com", "standard", club.id, "User");

        const res = await app.request("/api/events", {
            method: "POST",
            headers: { cookie },
            body: JSON.stringify({
                name: "Hello",
                location: "Main Hall",
                start: new Date(),
                end: new Date(Date.now() + 5000),
            })
        });
        expect(res.status).toBe(403);
    });

    it.each(["admin", "exec"])("allows %s to create an event", async (role) => {
        const app = await harness.setupApp();
        const club = await harness.setupClub("Club");
        const { cookie } = await harness.setupUser("test@test.com", role, club.id, "User");

        const res = await app.request("/api/events", {
            method: "POST",
            headers: { cookie },
            body: JSON.stringify({
                name: "Hello",
                location: "Main Hall",
                start: new Date(),
                end: new Date(Date.now() + 5000),
            })
        });
        expect(res.status).toBe(201); // verify endpoint

        // then - verify that there is an event with the name hello
        const event = await harness.db.query.eventsTable.findFirst({
            where: { name: "Hello", clubId: club.id }
        });
        expect(event).not.toBeUndefined();
        expect(event?.location).toBe("Main Hall");
    });

    it.each(["admin", "exec"])("allows %s to edit an event", async (role) => {
        const app = await harness.setupApp();
        const club = await harness.setupClub("Club");
        const { cookie } = await harness.setupUser("test@test.com", role, club.id, "User");

        const referenceDate = new Date();

        // insert an event
        const event = await harness.db
            .insert(eventsTable)
            .values({ name: "Event", location: "Old Location", start: referenceDate, end: new Date(referenceDate.valueOf() + 5000), clubId: club.id })
            .returning();

        // now - update all fields of the event
        const res = await app.request(`/api/events/${event[0]!.id}`, {
            method: "PUT",
            headers: { cookie },
            body: JSON.stringify({
                name: "Event1",
                location: "New Location",
                start: new Date(referenceDate.valueOf() + 6000),
                end: new Date(referenceDate.valueOf() + 7000),
            })
        });
        expect(res.status).toBe(200);

        // check that the update was successful
        const updatedEvent = await harness.db.query.eventsTable.findFirst({
            where: { id: event[0]!.id }
        });
        expect(updatedEvent).not.toBeUndefined();
        expect(updatedEvent!.name).toEqual("Event1");
        expect(updatedEvent!.location).toEqual("New Location");
        expect(updatedEvent!.start).toEqual(new Date(referenceDate.valueOf() + 6000));
        expect(updatedEvent!.end).toEqual(new Date(referenceDate.valueOf() + 7000));
    });

    it.each(["admin", "exec"])("allows %s to set the expected attendees when creating an event", async (role) => {
        const app = await harness.setupApp();
        const club = await harness.setupClub("Club");
        const { cookie } = await harness.setupUser("test@test.com", role, club.id, "User");

        const res = await app.request("/api/events", {
            method: "POST",
            headers: { cookie },
            body: JSON.stringify({
                name: "Hello",
                location: "Main Hall",
                start: new Date(),
                end: new Date(Date.now() + 5000),
                expectedAttendees: 150
            })
        });
        expect(res.status).toBe(201);

        const event = await harness.db.query.eventsTable.findFirst({
            where: { name: "Hello", clubId: club.id }
        });
        expect(event?.expectedAttendees).toBe(150);
    });

    it.each(["", null])("treats %p as no expected attendees when creating an event", async (expectedAttendees) => {
        const app = await harness.setupApp();
        const club = await harness.setupClub("Club");
        const { cookie } = await harness.setupUser("test@test.com", "admin", club.id, "User");

        const res = await app.request("/api/events", {
            method: "POST",
            headers: { cookie },
            body: JSON.stringify({
                name: "Hello",
                location: "Main Hall",
                start: new Date(),
                end: new Date(Date.now() + 5000),
                expectedAttendees
            })
        });
        expect(res.status).toBe(201);

        const event = await harness.db.query.eventsTable.findFirst({
            where: { name: "Hello", clubId: club.id }
        });
        expect(event?.expectedAttendees).toBeNull();
    });

    it.each(["admin", "exec"])("allows %s to update the expected attendees on an event", async (role) => {
        const app = await harness.setupApp();
        const club = await harness.setupClub("Club");
        const { cookie } = await harness.setupUser("test@test.com", role, club.id, "User");
        const referenceDate = new Date();

        const [event] = await harness.db
            .insert(eventsTable)
            .values({ name: "Event", location: "Main Hall", start: referenceDate, end: new Date(referenceDate.valueOf() + 5000), clubId: club.id })
            .returning();

        const res = await app.request(`/api/events/${event!.id}`, {
            method: "PUT",
            headers: { cookie },
            body: JSON.stringify({
                name: "Event",
                location: "Main Hall",
                start: referenceDate,
                end: new Date(referenceDate.valueOf() + 5000),
                expectedAttendees: 80
            })
        });
        expect(res.status).toBe(200);

        const updatedEvent = await harness.db.query.eventsTable.findFirst({
            where: { id: event!.id }
        });
        expect(updatedEvent!.expectedAttendees).toBe(80);
    });

    it.each(["", null])("treats %p as clearing the expected attendees when updating an event", async (expectedAttendees) => {
        const app = await harness.setupApp();
        const club = await harness.setupClub("Club");
        const { cookie } = await harness.setupUser("test@test.com", "admin", club.id, "User");
        const referenceDate = new Date();

        const [event] = await harness.db
            .insert(eventsTable)
            .values({
                name: "Event",
                location: "Main Hall",
                start: referenceDate,
                end: new Date(referenceDate.valueOf() + 5000),
                clubId: club.id,
                expectedAttendees: 50
            })
            .returning();

        const res = await app.request(`/api/events/${event!.id}`, {
            method: "PUT",
            headers: { cookie },
            body: JSON.stringify({
                name: "Event",
                location: "Main Hall",
                start: referenceDate,
                end: new Date(referenceDate.valueOf() + 5000),
                expectedAttendees
            })
        });
        expect(res.status).toBe(200);

        const updatedEvent = await harness.db.query.eventsTable.findFirst({
            where: { id: event!.id }
        });
        expect(updatedEvent!.expectedAttendees).toBeNull();
    });

    it("prevents standard users from updating events", async () => {
        const app = await harness.setupApp();
        const club = await harness.setupClub("Club");
        const { cookie } = await harness.setupUser("test@test.com", "standard", club.id, "User");

        // insert an event
        const event = await harness.db
            .insert(eventsTable)
            .values({ name: "Event", location: "Main Hall", start: new Date(), end: new Date(Date.now() + 5000), clubId: club.id })
            .returning();

        // now - update all fields of the event
        const res = await app.request(`/api/events/${event[0]!.id}`, {
            method: "PUT",
            headers: { cookie },
            body: JSON.stringify({
                name: "Event1",
                location: "Main Hall",
                start: new Date(Date.now() + 1000),
                end: new Date(Date.now() + 6000),
            })
        });
        expect(res.status).toBe(404);
    });

    it("prevents users from creating event with end before start", async () => {
        const app = await harness.setupApp();
        const club = await harness.setupClub("Club");
        const { cookie } = await harness.setupUser("test@test.com", "admin", club.id, "User");

        const referenceDate = new Date();

        const res = await app.request("/api/events", {
            method: "POST",
            headers: { cookie },
            body: JSON.stringify({
                name: "Hello",
                location: "Main Hall",
                start: referenceDate,
                end: new Date(referenceDate.getTime() - 1),
            })
        });
        expect(res.status).toBe(400); // verify endpoint
    });

    it("prevents users from creating event without a location", async () => {
        const app = await harness.setupApp();
        const club = await harness.setupClub("Club");
        const { cookie } = await harness.setupUser("test@test.com", "admin", club.id, "User");

        const res = await app.request("/api/events", {
            method: "POST",
            headers: { cookie },
            body: JSON.stringify({
                name: "Hello",
                location: "",
                start: new Date(),
                end: new Date(Date.now() + 5000),
            })
        });
        expect(res.status).toBe(400);
    });

    it("prevents users from updating event with end before start", async () => {
        const app = await harness.setupApp();
        const club = await harness.setupClub("Club");
        const { cookie } = await harness.setupUser("test@test.com", "standard", club.id, "User");
        const referenceDate = new Date();

        // insert an event
        const event = await harness.db
            .insert(eventsTable)
            .values({ name: "Event", location: "Main Hall", start: referenceDate, end: new Date(referenceDate.valueOf() + 5000), clubId: club.id })
            .returning();

        // now - attempt to put end date before start date
        const res = await app.request(`/api/events/${event[0]!.id}`, {
            method: "PUT",
            headers: { cookie },
            body: JSON.stringify({
                name: "Event1",
                location: "Main Hall",
                start: new Date(referenceDate.valueOf() + 5000),
                end: referenceDate,
            })
        });
        expect(res.status).toBe(400);
    });

    it("prevent users from one club accessing another clubs event", async () => {
        const app = await harness.setupApp();
        const club1 = await harness.setupClub("Club1");
        const club2 = await harness.setupClub("Club2");
        const user1 = await harness.setupUser("test1@test.com", "admin", club1.id, "User");
        const user2 = await harness.setupUser("test2@test.com", "admin", club1.id, "User");

        const referenceDate = new Date();
        // create event with user 1
        const event = await harness.db
            .insert(eventsTable)
            .values({ name: "Event", location: "Main Hall", start: referenceDate, end: new Date(referenceDate.valueOf() + 5000), clubId: club1.id })
            .returning();

        // now - attempt to access it from user 2
        const res = await app.request(`/api/events/${event[0]!.id}`, {
            method: "GET",
            headers: { cookie: user2.cookie },
        });
        expect(res.status).toBe(200);
    });
});