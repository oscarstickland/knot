import { Route, Routes } from "react-router";
import "./index.css";
import { IndexPage } from "./routes/IndexPage";
import { RequireAuth } from "./lib/auth";
import { AppShell } from "./routes/AppShell";
import { DashboardPage } from "./routes/DashboardPage";
import { LoginPage } from "./routes/login/LoginPage";

export function Root() {
  return <Routes>
    <Route index element={<IndexPage />} />

    <Route path="/app" element={<RequireAuth><AppShell /></RequireAuth>}>
      <Route index element={<DashboardPage />} />
    </Route>

    <Route path="/auth/login" element={<LoginPage />} />
  </Routes>
}

export default Root;
