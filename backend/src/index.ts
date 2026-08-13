import {Hono, type MiddlewareHandler} from "hono";
import { userApp } from "./routes/user";
import { cors } from "hono/cors";
import { authApp } from "./routes/auth";
import {attachDatabase, type DbEnv} from "./db/connection";
import { serveStatic } from "hono/bun";
import {eventsApp} from "./routes/events.ts";
import {HTTPException} from "hono/http-exception";

export function createApp(dbMiddleware: MiddlewareHandler<DbEnv> = attachDatabase) {
    const app = new Hono();

    // -- Cors --
    // should only apply if in the developer env
    if (process.env.NODE_ENV !== "production") {
        app.use("*", cors({
            origin: "http://localhost:5173",
            credentials: true,
            allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH"]
        }));
    }

    app.use("*", dbMiddleware);

    app.route("/api/user", userApp);
    app.route("/api/auth", authApp);
    app.route("/api/events", eventsApp);
    app.all("/api/*", (c) => { throw new HTTPException(404) });

    // Serve the frontend
    app.use("/*", serveStatic({ root: "./dist" }));
    app.get("*", serveStatic({ path: "./dist/index.html" }));

    return app;
}

const app = createApp();
export default app;