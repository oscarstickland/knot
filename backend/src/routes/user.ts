import { Hono } from "hono";
import { isAuthenticated, type UserEnv } from "../services/auth";

const userApp = new Hono<UserEnv>();
userApp.use("*", isAuthenticated);

userApp.get("/me", async (c) => {
    return c.json(c.var.user);
});

export { userApp };