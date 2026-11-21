import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import type { Role } from "@team1/shared";
import { Layout } from "./components/Layout.tsx";
import { container, Spinner } from "./components/ui.tsx";
import { useAuth } from "./lib/auth.tsx";
import { useI18n } from "./lib/i18n.tsx";
import { AdminPage } from "./pages/AdminPage.tsx";
import { ContactPage } from "./pages/ContactPage.tsx";
import { DashboardPage } from "./pages/DashboardPage.tsx";
import { HomePage } from "./pages/HomePage.tsx";
import { JobDetailPage } from "./pages/JobDetailPage.tsx";
import { JobsPage } from "./pages/JobsPage.tsx";
import { LoginPage } from "./pages/LoginPage.tsx";
import { NotificationsPage } from "./pages/NotificationsPage.tsx";
import { PairingPage } from "./pages/PairingPage.tsx";
import { ProfilePage } from "./pages/ProfilePage.tsx";
import { PublicProfilePage } from "./pages/PublicProfilePage.tsx";
import { TicketDetailPage } from "./pages/TicketDetailPage.tsx";
import { TicketsPage } from "./pages/TicketsPage.tsx";

function RequireAuth({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (roles && !roles.includes(user.role)) {
    return <p className={`${container} py-16 text-sm text-zinc-500`}>{t("noAccess")}</p>;
  }
  return children;
}

function NotFound() {
  const { t } = useI18n();
  return <p className={`${container} py-16 text-sm text-zinc-500`}>{t("pageNotFound")}</p>;
}

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/jobs/:id" element={<JobDetailPage />} />
        <Route path="/u/:username" element={<PublicProfilePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
        <Route path="/pairings/:id" element={<RequireAuth><PairingPage /></RequireAuth>} />
        <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
        <Route path="/notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
        <Route path="/tickets" element={<RequireAuth><TicketsPage /></RequireAuth>} />
        <Route path="/tickets/:id" element={<RequireAuth><TicketDetailPage /></RequireAuth>} />
        <Route path="/admin" element={<RequireAuth roles={["admin", "support"]}><AdminPage /></RequireAuth>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}
