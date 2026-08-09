import {Hono} from "hono";
import {isAuthenticated, type UserEnv} from "../services/auth.ts";

const userApp = new Hono<UserEnv>();
userApp.use("*", isAuthenticated);

userApp.get("/events", async (c) => {
    const user = c.var.user;

})