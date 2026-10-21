import { Route, Routes } from "react-router";
import "./index.css";
import { IndexPage } from "./routes/IndexPage";
import { RequireAuth } from "./lib/auth";
import { AppShell } from "./routes/AppShell";
import { DashboardPage } from "./routes/DashboardPage";
import { LoginPage } from "./routes/login/LoginPage";
import {EventsListPage} from "@/routes/EventsListPage.tsx";
import {BudgetOverviewPage} from "@/routes/BudgetOverviewPage.tsx";
import {EventPage} from "@/routes/EventPage/EventPage";
import {AdminPage} from "@/routes/AdminPage.tsx";
import { SuperAdminShell } from "./routes/super-admin/SuperAdminShell";
import { ClubsPage } from "./routes/super-admin/ClubsPage";
import { ClubPage } from "./routes/super-admin/ClubPage";
import { AttendanceForm } from "./routes/AttendanceForm";

export function Root() {
  return <Routes>
    <Route index element={<IndexPage />} />

    <Route path="/app" element={<RequireAuth area="club"><AppShell /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="budget" element={<BudgetOverviewPage />} />
        <Route path="events" element={<EventsListPage />} />
        <Route path="events/:id" element={<EventPage />} />
        <Route path='admin' element={<AdminPage />} />
    </Route>

    <Route path="/super" element={<RequireAuth area="superadmin"><SuperAdminShell /></RequireAuth>}>
        <Route index element={<ClubsPage />} />
        <Route path="clubs/:id" element={<ClubPage />} />
    </Route>

    <Route path="/auth/login" element={<LoginPage />} />

    <Route path="/attendance/:slug/register" element={<AttendanceForm />} />
  </Routes>
}

export default Root;
