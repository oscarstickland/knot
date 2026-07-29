import { Hono } from "hono";
import { userApp } from "./routes/user";
import { cors } from "hono/cors";
import { authApp } from "./routes/auth";
import { attachDatabase } from "./db/connection";

const app = new Hono();

app.use("*", cors({
    origin: "http://localhost:5173",
    credentials: true,
    allowMethods: ["GET", "POST"]
}));
app.use("*", attachDatabase);

app.route("/user", userApp);
app.route("/auth", authApp);

export default app;