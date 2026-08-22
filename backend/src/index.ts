import {Hono, type MiddlewareHandler} from "hono";
import { userApp } from "./routes/user";
import { cors } from "hono/cors";
import { authApp } from "./routes/auth";
import {attachDatabase, type DbEnv} from "./db/connection";
import { serveStatic } from "hono/bun";
import {eventsApp} from "./routes/events.ts";
import {tasksApp} from "./routes/tasks.ts";
import {HTTPException} from "hono/http-exception";
import { tasksApp } from "./routes/tasks.ts";

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
    app.route("/api/tasks", tasksApp);
    app.all("/api/*", (c) => { throw new HTTPException(404) });

    // Serve the frontend
    app.use("/*", serveStatic({ root: "./dist" }));
    app.get("*", serveStatic({ path: "./dist/index.html" }));

    app.onError((err, context) => {
        if (err instanceof HTTPException) {
            return context.json({ message: err.message || undefined }, err.status);
        }

        return context.json({ message: undefined }, 500);
    })

    return app;
}

const app = createApp();
export default app;