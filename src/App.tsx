import { BrowserRouter, Routes, Route, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { useEffect, type ReactNode } from "react";
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
import LicenseGate from "./components/LicenseGate";
import LicensePage from "./pages/LicensePage";
import AdminControlsPage from "./pages/AdminControlsPage";
import SchedulesPage from "./pages/SchedulesPage";
import PayrollPage from "./pages/PayrollPage";
import { kioskIsConfigured } from "./lib/kiosk";
import Skeleton from "./components/Skeleton";

function LoadingScreen() {
  return (
    <div className="page-ambient flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-md space-y-5 p-7">
        <div className="flex items-center gap-3"><Skeleton className="h-10 w-10 rounded-xl" /><div className="space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-48" /></div></div>
        <Skeleton className="h-24 w-full" />
        <div className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-11 w-full" /></div>
      </div>
    </div>
  );
}

function RequireAuth({ children, adminOnly = false, withLayout = true, enforceLicense = true }: { children: ReactNode; adminOnly?: boolean; withLayout?: boolean; enforceLicense?: boolean }) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingScreen />;
  if (!user) {
    const redirectPath = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={withRedirect("/login", redirectPath)} replace />;
  }
  if (adminOnly && !hasManagementAccess(profile?.role)) return <Navigate to="/dashboard" replace />;
  const content = withLayout ? <Layout>{children}</Layout> : children;
  return enforceLicense ? <LicenseGate>{content}</LicenseGate> : content;
}

function AuthPageRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingScreen />;
  if (user) return <Navigate to={getSafeRedirectPath(location.search)} replace />;

  return <LoginPage />;
}

function RequireKioskAccess({ children }: { children: ReactNode }) {
  const [searchParams] = useSearchParams();
  const { profile, loading } = useAuth();
  if (searchParams.get("token") && kioskIsConfigured()) return <LicenseGateByKiosk>{children}</LicenseGateByKiosk>;
  if (loading) return <LoadingScreen />;
  if (!hasManagementAccess(profile?.role)) return <Navigate to="/dashboard" replace />;
  return <LicenseGate>{children}</LicenseGate>;
}

function LicenseGateByKiosk({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function AppRoutes() {
  const location = useLocation();

  useEffect(() => {
    const titles: Record<string, string> = {
      "/login": "Sign in",
      "/dashboard": "Overview",
      "/clock": "Time Clock",
      "/clock/station": "Clock Station",
      "/timesheets": "Attendance Log",
      "/leave": "Leave Requests",
      "/payroll": "Payroll",
      "/reports": "Reports",
      "/members": "Members",
      "/visitors": "Visitors",
      "/users": "Users",
      "/admin-controls": "Admin Controls",
      "/schedules": "Schedule",
      "/settings": "Settings",
    };
    const title = Object.entries(titles).find(([path]) => location.pathname === path || location.pathname.startsWith(`${path}/`))?.[1] || "AttendanceIQ";
    document.title = title === "AttendanceIQ" ? title : `${title} · AttendanceIQ`;
  }, [location.pathname]);

  return (
    <Routes>
      <Route path="/login" element={<AuthPageRoute />} />
      <Route path="/license" element={<RequireAuth withLayout={false} enforceLicense={false}><LicensePage /></RequireAuth>} />
      <Route path="/register" element={<Navigate to="/login" replace />} />
      <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
      <Route path="/clock/station" element={<RequireKioskAccess><ClockPage standalone /></RequireKioskAccess>} />
      <Route path="/clock" element={<RequireAuth><ClockPage /></RequireAuth>} />
      <Route path="/timesheets" element={<RequireAuth><TimesheetsPage /></RequireAuth>} />
      <Route path="/timesheets/:source/:recordId" element={<RequireAuth><TimesheetsPage /></RequireAuth>} />
      <Route path="/leave/new" element={<RequireAuth withLayout={false}><LeavePage /></RequireAuth>} />
      <Route path="/leave/admin/new" element={<RequireAuth><LeavePage /></RequireAuth>} />
      <Route path="/leave/:requestId/edit" element={<RequireAuth><LeavePage /></RequireAuth>} />
      <Route path="/leave" element={<RequireAuth><LeavePage /></RequireAuth>} />
      <Route path="/payroll" element={<RequireAuth adminOnly><PayrollPage /></RequireAuth>} />
      <Route path="/reports" element={<RequireAuth><ReportsPage /></RequireAuth>} />
      <Route path="/members/new" element={<RequireAuth><MembersPage /></RequireAuth>} />
      <Route path="/members/:memberId/edit" element={<RequireAuth><MembersPage /></RequireAuth>} />
      <Route path="/members" element={<RequireAuth><MembersPage /></RequireAuth>} />
      <Route path="/visitors" element={<RequireAuth><VisitorsPage /></RequireAuth>} />
      <Route path="/users" element={<RequireAuth adminOnly><UsersPage /></RequireAuth>} />
      <Route path="/admin-controls" element={<RequireAuth adminOnly><AdminControlsPage /></RequireAuth>} />
      <Route path="/schedules" element={<RequireAuth adminOnly><SchedulesPage /></RequireAuth>} />
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
