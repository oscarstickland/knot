import { describe, it, expect } from "bun:test";
import { createMiddleware } from "hono/factory";
import { sign } from "hono/jwt";
import type { DbEnv } from "../../db/connection.ts";
import { createApp } from "../../index.ts";
import { AUTH_COOKIE_NAME, JWT_SECRET } from "../../services/auth.ts";

// The database is never reached: every request below must be rejected on the token alone.
const noDb = createMiddleware<DbEnv>(async (c, next) => {
    c.set("db", new Proxy({}, { get() { throw new Error("database should not be touched"); } }) as DbEnv["Variables"]["db"]);
    await next();
});

const payload = { data: JSON.stringify({ id: 1, email: "root@test.com" }) };

async function request(path: string, token?: string) {
    const app = createApp(noDb);
    return app.request(path, { headers: token ? { cookie: `${AUTH_COOKIE_NAME}=${token}` } : {} });
}

describe("auth token verification", () => {
    it("rejects a token signed with the wrong secret", async () => {
        const forged = await sign(payload, "not-the-real-secret");
        expect((await request("/api/super-admin/clubs", forged)).status).toBe(401);
        expect((await request("/api/user/me", forged)).status).toBe(401);
        expect((await request("/api/events", forged)).status).toBe(401);
    });

    it("rejects an unsigned (alg none) token", async () => {
        const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
        const unsigned = `${b64({ alg: "none", typ: "JWT" })}.${b64(payload)}.`;
        expect((await request("/api/super-admin/clubs", unsigned)).status).toBe(401);
    });

    it("rejects an expired token", async () => {
        const expired = await sign({ ...payload, exp: Math.floor(Date.now() / 1000) - 60 }, JWT_SECRET);
        expect((await request("/api/user/me", expired)).status).toBe(401);
    });

    it("rejects a request with no token", async () => {
        expect((await request("/api/super-admin/clubs")).status).toBe(401);
    });
});
