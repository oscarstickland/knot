import { Hono } from "hono";
import { userApp } from "./routes/user";
import { cors } from "hono/cors";
import { authApp } from "./routes/auth";
import { attachDatabase } from "./db/connection";
import { serveStatic } from "hono/bun";

const app = new Hono();

// -- Cors --
// should only apply if in the developer env
if (process.env.NODE_ENV !== "production") {
    app.use("*", cors({
        origin: "http://localhost:5173",
        credentials: true,
        allowMethods: ["GET", "POST"]
    }));
}

app.use("*", attachDatabase);

app.route("/api/user", userApp);
app.route("/api/auth", authApp);

// Serve the frontend

app.use("/*", serveStatic({ root: "./dist" }))
app.get("*", serveStatic({ path: "./dist/index.html" }))

export default app;