import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ClockPage from "./pages/ClockPage";
import TimesheetsPage from "./pages/TimesheetsPage";
import LeavePage from "./pages/LeavePage";
import ReportsPage from "./pages/ReportsPage";
import SettingsPage from "./pages/SettingsPage";
import MembersPage from "./pages/MembersPage";
import VisitorsPage from "./pages/VisitorsPage";
import UsersPage from "./pages/UsersPage";
import { getSafeRedirectPath, withRedirect } from "./lib/authRedirect";
import { hasManagementAccess } from "./lib/workforce";

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
    </div>
  );
}

function RequireAuth({ children, adminOnly = false, withLayout = true }) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingScreen />;
  if (!user) {
    const redirectPath = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={withRedirect("/login", redirectPath)} replace />;
  }
  if (adminOnly && !hasManagementAccess(profile?.role)) return <Navigate to="/dashboard" replace />;
  return withLayout ? <Layout>{children}</Layout> : children;
}

function AuthPageRoute({ mode = "signin" }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingScreen />;
  if (user) return <Navigate to={getSafeRedirectPath(location.search)} replace />;

  return <LoginPage mode={mode} />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPageRoute />} />
      <Route path="/register" element={<Navigate to="/login" replace />} />
      <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
      <Route path="/clock/station" element={<RequireAuth withLayout={false}><ClockPage standalone /></RequireAuth>} />
      <Route path="/clock" element={<RequireAuth><ClockPage /></RequireAuth>} />
      <Route path="/timesheets" element={<RequireAuth><TimesheetsPage /></RequireAuth>} />
      <Route path="/timesheets/:source/:recordId" element={<RequireAuth><TimesheetsPage /></RequireAuth>} />
      <Route path="/leave/new" element={<RequireAuth withLayout={false}><LeavePage /></RequireAuth>} />
      <Route path="/leave/admin/new" element={<RequireAuth><LeavePage /></RequireAuth>} />
      <Route path="/leave/:requestId/edit" element={<RequireAuth><LeavePage /></RequireAuth>} />
      <Route path="/leave" element={<RequireAuth><LeavePage /></RequireAuth>} />
      <Route path="/reports" element={<RequireAuth><ReportsPage /></RequireAuth>} />
      <Route path="/members/new" element={<RequireAuth><MembersPage /></RequireAuth>} />
      <Route path="/members/:memberId/edit" element={<RequireAuth><MembersPage /></RequireAuth>} />
      <Route path="/members" element={<RequireAuth><MembersPage /></RequireAuth>} />
      <Route path="/visitors" element={<RequireAuth><VisitorsPage /></RequireAuth>} />
      <Route path="/users" element={<RequireAuth adminOnly><UsersPage /></RequireAuth>} />
      <Route path="/employees" element={<Navigate to="/members" replace />} />
      <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
