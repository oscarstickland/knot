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
import { AttendanceForm } from "./routes/AttendanceForm";

export function Root() {
  return <Routes>
    <Route index element={<IndexPage />} />

    <Route path="/app" element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="budget" element={<BudgetOverviewPage />} />
        <Route path="events" element={<EventsListPage />} />
        <Route path="events/:id" element={<EventPage />} />
        <Route path='admin' element={<AdminPage />} />
    </Route>

    <Route path="/auth/login" element={<LoginPage />} />

    <Route path="/attendance/register" element={<AttendanceForm />} />
  </Routes>
}

export default Root;
