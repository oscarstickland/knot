import {Hono} from "hono";
import {isAuthenticated, type UserEnv} from "../services/auth.ts";
import type {DbEnv} from "../db/connection.ts";

const eventsApp = new Hono<UserEnv & DbEnv>();
eventsApp.use("*", isAuthenticated);

eventsApp.get("/", async (c) => {
    const user = c.var.user;
    const db = c.get('db');

    const events = await db.query.eventsTable.findMany({
        where: { clubId: user.club.id }
    });

    return c.json(events);
});

export { eventsApp };