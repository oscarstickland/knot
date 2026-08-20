import { Hono } from "hono";
import { userApp } from "./routes/user";
import { cors } from "hono/cors";
import { authApp } from "./routes/auth";
import { attachDatabase } from "./db/connection";
import { serveStatic } from "hono/bun";
import {eventsApp} from "./routes/events.ts";
import {tasksApp} from "./routes/tasks.ts";
import {HTTPException} from "hono/http-exception";

const app = new Hono();

// -- Cors --
// should only apply if in the developer env
if (process.env.NODE_ENV !== "production") {
    app.use("*", cors({
        origin: "http://localhost:5173",
        credentials: true,
        allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE"]
    }));
}

app.use("*", attachDatabase);

app.route("/api/user", userApp);
app.route("/api/auth", authApp);
app.route("/api/events", eventsApp);
app.route("/api/tasks", tasksApp);
app.all("/api/*", () => { throw new HTTPException(404) });

// Serve the frontend

app.use("/*", serveStatic({ root: "./dist" }))
app.get("*", serveStatic({ path: "./dist/index.html" }))

export default app;