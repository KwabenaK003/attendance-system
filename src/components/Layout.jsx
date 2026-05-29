import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { formatDistanceToNow } from "date-fns";
import { getRoleLabel, hasManagementAccess } from "../lib/workforce";
import { buildMemberActivity, sortTimeActivity } from "../lib/timeRecords";
import {
  Clock, LayoutDashboard, Users, FileText,
  Calendar, BarChart2, Settings, LogOut, Menu, X, ChevronRight,
  Bell, Building2, CheckCircle2, Clock3, ScanFace, UserRound, ClipboardList, UserPlus
} from "lucide-react";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/clock", icon: Clock, label: "Time Clock" },
  { to: "/timesheets", icon: FileText, label: "Attendance Log" },
  { to: "/leave", icon: Calendar, label: "Leave Requests" },
  { to: "/reports", icon: BarChart2, label: "Reports" },
  { to: "/members", icon: Users, label: "Members" },
  { to: "/visitors", icon: UserRound, label: "Visitors" },
  { to: "/settings", icon: Settings, label: "Settings" },
  { to: "/users", icon: UserPlus, label: "Users" },
];

function NotificationRow({ icon: Icon, title, body, tone = "default" }) {
  const toneClasses = {
    default: "border-slate-800 bg-slate-900/70 text-slate-300",
    success: "border-accent/20 bg-accent/10 text-accent",
    warning: "border-warn/20 bg-warn/10 text-warn",
    info: "border-info/20 bg-info/10 text-info",
  };

  return (
    <div className={`rounded-2xl border px-3 py-3 ${toneClasses[tone] || toneClasses.default}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl border border-current/15 bg-black/10">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">{title}</p>
          <p className="mt-1 text-xs leading-5 text-current/90">{body}</p>
        </div>
      </div>
    </div>
  );
}

export default function Layout({ children }) {
  const { profile, signOut, displayName } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebarExpanded, setDesktopSidebarExpanded] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationPanelStyle, setNotificationPanelStyle] = useState({ top: 56, right: 16, width: 352 });
  const [notificationState, setNotificationState] = useState({
    loading: false,
    latestPunch: null,
    latestMemberActivity: null,
    activeMemberSessions: 0,
    latestLeaveRequest: null,
    pendingLeaveCount: 0,
    error: "",
  });
  const notificationRef = useRef(null);
  const notificationButtonRef = useRef(null);
  const notificationPanelRef = useRef(null);
  const isAdmin = hasManagementAccess(profile?.role);

  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  const initials = profile?.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "U";

  const loadNotificationState = useCallback(async ({ silent = false } = {}) => {
    if (!profile?.id) {
      setNotificationState({
        loading: false,
        latestPunch: null,
        latestMemberActivity: null,
        activeMemberSessions: 0,
        latestLeaveRequest: null,
        pendingLeaveCount: 0,
        error: "",
      });
      return;
    }

    if (!silent) {
      setNotificationState((current) => ({ ...current, loading: true, error: "" }));
    }

    try {
      const punchQuery = supabase
        .from("punches")
        .select("type, timestamp")
        .eq("user_id", profile.id)
        .order("timestamp", { ascending: false })
        .limit(1);

      const leaveQuery = supabase
        .from("leave_requests")
        .select("status, start_date, end_date, created_at")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(1);

      const adminLeaveQuery = isAdmin
        ? supabase.from("leave_requests").select("id").eq("status", "pending")
        : Promise.resolve({ data: [], error: null });

      const memberEntriesQuery = isAdmin
        ? supabase
          .from("member_entries")
          .select("id, member_id, punch_in, punch_out, members(full_name)")
          .order("punch_in", { ascending: false })
          .limit(10)
        : Promise.resolve({ data: [], error: null });

      const activeMemberSessionsQuery = isAdmin
        ? supabase.from("member_entries").select("id").is("punch_out", null)
        : Promise.resolve({ data: [], error: null });

      const [
        { data: latestPunch, error: punchError },
        { data: latestLeaveRequest, error: leaveError },
        { data: pendingRequests, error: pendingError },
        { data: recentMemberEntries, error: memberEntriesError },
        { data: activeMemberSessions, error: activeMemberSessionsError },
      ] = await Promise.all([punchQuery, leaveQuery, adminLeaveQuery, memberEntriesQuery, activeMemberSessionsQuery]);

      if (punchError) throw punchError;
      if (leaveError) throw leaveError;
      if (pendingError) throw pendingError;
      if (memberEntriesError) throw memberEntriesError;
      if (activeMemberSessionsError) throw activeMemberSessionsError;

      const latestMemberActivity = sortTimeActivity(buildMemberActivity(recentMemberEntries || []))[0] || null;

      setNotificationState({
        loading: false,
        latestPunch: latestPunch?.[0] || null,
        latestMemberActivity,
        activeMemberSessions: activeMemberSessions?.length || 0,
        latestLeaveRequest: latestLeaveRequest?.[0] || null,
        pendingLeaveCount: pendingRequests?.length || 0,
        error: "",
      });
    } catch (error) {
      setNotificationState((current) => ({
        loading: false,
        latestPunch: silent ? current.latestPunch : null,
        latestMemberActivity: silent ? current.latestMemberActivity : null,
        activeMemberSessions: silent ? current.activeMemberSessions : 0,
        latestLeaveRequest: silent ? current.latestLeaveRequest : null,
        pendingLeaveCount: silent ? current.pendingLeaveCount : 0,
        error: error.message || "Unable to load notifications right now.",
      }));
    }
  }, [profile?.id, isAdmin]);

  useEffect(() => {
    if (!notificationsOpen) {
      return undefined;
    }

    function updateNotificationPosition() {
      const buttonRect = notificationButtonRef.current?.getBoundingClientRect();
      if (!buttonRect) {
        return;
      }

      const maxWidth = Math.min(352, window.innerWidth - 16);
      const rightOffset = Math.max(window.innerWidth - buttonRect.right, 8);
      setNotificationPanelStyle({
        top: buttonRect.bottom + 12,
        right: rightOffset,
        width: maxWidth,
      });
    }

    function handlePointerDown(event) {
      const clickedTrigger = notificationRef.current?.contains(event.target);
      const clickedPanel = notificationPanelRef.current?.contains(event.target);
      if (!clickedTrigger && !clickedPanel) {
        setNotificationsOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setNotificationsOpen(false);
      }
    }

    updateNotificationPosition();
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", updateNotificationPosition);
    window.addEventListener("scroll", updateNotificationPosition, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", updateNotificationPosition);
      window.removeEventListener("scroll", updateNotificationPosition, true);
    };
  }, [notificationsOpen]);

  useEffect(() => {
    void loadNotificationState();
  }, [loadNotificationState, profile?.department, profile?.face_reference]);

  useEffect(() => {
    if (!profile?.id) {
      return undefined;
    }

    const refreshNotifications = () => {
      void loadNotificationState({ silent: true });
    };

    const intervalId = window.setInterval(refreshNotifications, 15000);

    function handleWindowFocus() {
      refreshNotifications();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        refreshNotifications();
      }
    }

    const channel = supabase
      .channel(`notifications-${profile.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "punches",
        filter: `user_id=eq.${profile.id}`,
      }, refreshNotifications)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "leave_requests",
        filter: `user_id=eq.${profile.id}`,
      }, refreshNotifications);

    if (isAdmin) {
      channel.on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "leave_requests",
      }, refreshNotifications);
      channel.on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "member_entries",
      }, refreshNotifications);
    }

    channel.subscribe();
    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void supabase.removeChannel(channel);
    };
  }, [profile?.id, isAdmin, loadNotificationState]);

  const notifications = [];

  if (!profile?.department) {
    notifications.push({
      id: "department",
      icon: UserRound,
      title: "Department missing",
      body: "Add your department in Settings so your account details stay complete.",
      tone: "warning",
    });
  }

  if (!profile?.face_reference) {
    notifications.push({
      id: "face-clock",
      icon: ScanFace,
      title: "Face Clock not enrolled",
      body: "Add a face enrollment in Settings to use the shared face clock.",
      tone: "warning",
    });
  }

  if (notificationState.latestPunch?.timestamp) {
    const isClockedIn = notificationState.latestPunch.type === "in";
    notifications.push({
      id: "punch-status",
      icon: isClockedIn ? Clock3 : CheckCircle2,
      title: isClockedIn ? "You are currently clocked in" : "Last punch recorded",
      body: `${isClockedIn ? "Clocked in" : "Clocked out"} ${formatDistanceToNow(new Date(notificationState.latestPunch.timestamp), { addSuffix: true })}.`,
      tone: isClockedIn ? "info" : "success",
    });
  }

  if (isAdmin && notificationState.activeMemberSessions > 0) {
    notifications.push({
      id: "active-member-sessions",
      icon: Clock3,
      title: "Members currently clocked in",
      body: `${notificationState.activeMemberSessions} member${notificationState.activeMemberSessions === 1 ? "" : "s"} currently have an active time session.`,
      tone: "info",
    });
  }

  if (isAdmin && notificationState.latestMemberActivity?.timestamp) {
    const memberAction = notificationState.latestMemberActivity.type === "in" ? "clocked in" : "clocked out";
    notifications.push({
      id: "member-clock-activity",
      icon: notificationState.latestMemberActivity.type === "in" ? Clock3 : CheckCircle2,
      title: `${notificationState.latestMemberActivity.actorLabel || "A member"} ${memberAction}`,
      body: `${notificationState.latestMemberActivity.personType} activity was recorded ${formatDistanceToNow(new Date(notificationState.latestMemberActivity.timestamp), { addSuffix: true })}.`,
      tone: notificationState.latestMemberActivity.type === "in" ? "info" : "success",
    });
  }

  if (notificationState.latestLeaveRequest?.created_at) {
    const { status, start_date: startDate, end_date: endDate } = notificationState.latestLeaveRequest;
    notifications.push({
      id: "leave-request",
      icon: ClipboardList,
      title: `Latest leave request: ${status}`,
      body: `Request for ${startDate} to ${endDate} was updated ${formatDistanceToNow(new Date(notificationState.latestLeaveRequest.created_at), { addSuffix: true })}.`,
      tone: status === "approved" ? "success" : status === "rejected" ? "warning" : "info",
    });
  }

  if (isAdmin && notificationState.pendingLeaveCount > 0) {
    notifications.push({
      id: "pending-leave",
      icon: ClipboardList,
      title: "Pending leave approvals",
      body: `${notificationState.pendingLeaveCount} leave request${notificationState.pendingLeaveCount === 1 ? "" : "s"} need review.`,
      tone: "info",
    });
  }

  const unreadCount = notifications.length;
  const visibleNavItems = navItems;

  const handleDesktopSidebarBlur = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setDesktopSidebarExpanded(false);
    }
  };

  const SidebarContent = ({ compact = false }) => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={`border-b border-slate-800 py-6 ${compact ? "px-3" : "px-4"}`}>
        <div className={`flex items-center ${compact ? "justify-center" : "gap-3"}`}>
          <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/30 flex items-center justify-center clock-ring">
            <Building2 className="w-4 h-4 text-accent" />
          </div>
          <div className={compact ? "hidden" : "min-w-0"}>
            <h1 className="font-display font-bold text-white text-lg leading-none">Attendance Management</h1>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className={`flex-1 py-4 space-y-0.5 overflow-y-auto ${compact ? "px-2" : "px-3"}`}>
        {!compact && <p className="text-slate-600 text-xs font-semibold uppercase tracking-wider px-3 mb-2">Main</p>}
        {visibleNavItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            title={compact ? label : undefined}
            className={({ isActive }) => `nav-link group ${compact ? "compact" : ""} ${isActive ? "active" : ""}`}
            onClick={() => setSidebarOpen(false)}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {!compact && <span>{label}</span>}
            {!compact && <ChevronRight className="w-3 h-3 ml-auto opacity-0 transition-opacity group-hover:opacity-100" />}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className={`border-t border-slate-800 ${compact ? "p-2" : "p-3"}`}>
        <div className={`rounded-xl ${compact ? "flex flex-col items-center gap-2 px-2 py-3" : "flex items-center gap-3 px-3 py-2"}`}>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent/30 to-accent/10 border border-accent/20 flex items-center justify-center text-accent text-xs font-bold font-display flex-shrink-0">
            {initials}
          </div>
          <div className={compact ? "hidden" : "flex-1 min-w-0"}>
            <p className="text-white text-sm font-medium truncate">{displayName}</p>
            <p className="text-slate-500 text-xs">{getRoleLabel(profile?.role)}</p>
          </div>
          <button
            onClick={handleSignOut}
            className={`text-slate-500 hover:text-danger transition-colors ${compact ? "" : "ml-auto"}`}
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex flex-col border-r border-slate-800 bg-slate-950/90 flex-shrink-0 transition-[width] duration-300 ease-out ${
          desktopSidebarExpanded ? "w-60" : "w-20"
        }`}
        onMouseEnter={() => setDesktopSidebarExpanded(true)}
        onMouseLeave={() => setDesktopSidebarExpanded(false)}
        onFocusCapture={() => setDesktopSidebarExpanded(true)}
        onBlurCapture={handleDesktopSidebarBlur}
      >
        <SidebarContent compact={!desktopSidebarExpanded} />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-64 bg-slate-950 border-r border-slate-800 flex flex-col z-10">
            <button
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-5 h-5" />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm flex items-center px-4 gap-4 flex-shrink-0">
          <button className="lg:hidden text-slate-400 hover:text-white" onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <div className="relative" ref={notificationRef}>
            <button
              ref={notificationButtonRef}
              type="button"
              onClick={() => setNotificationsOpen((open) => !open)}
              className={`relative flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                notificationsOpen
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-slate-700 bg-slate-800 text-slate-400 hover:text-white"
              }`}
              title="Notifications"
              aria-label="Toggle notifications"
              aria-expanded={notificationsOpen}
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <>
                  <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-accent" />
                  <span className="absolute -right-1.5 -top-1.5 min-w-4 rounded-full bg-accent px-1 text-[10px] font-bold leading-4 text-slate-950">
                    {unreadCount}
                  </span>
                </>
              )}
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>

      {notificationsOpen && createPortal(
        <div className="pointer-events-none fixed inset-0 z-[120]">
          <div
            ref={notificationPanelRef}
            className="pointer-events-auto fixed rounded-3xl border border-slate-800 bg-slate-950/95 p-4 shadow-2xl shadow-black/40 backdrop-blur"
            style={notificationPanelStyle}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-semibold text-white">Notifications</h3>
                <p className="mt-1 text-xs text-slate-500">
                  {unreadCount > 0 ? `${unreadCount} update${unreadCount === 1 ? "" : "s"} available` : "Everything looks up to date"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNotificationsOpen(false)}
                className="rounded-xl border border-slate-800 p-2 text-slate-500 transition-colors hover:text-white"
                aria-label="Close notifications"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {notificationState.loading ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-5 text-sm text-slate-400">
                Loading notifications...
              </div>
            ) : notificationState.error ? (
              <div className="rounded-2xl border border-danger/20 bg-danger/10 px-4 py-5 text-sm text-danger">
                {notificationState.error}
              </div>
            ) : notifications.length === 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-5 text-sm text-slate-400">
                No new notifications right now.
              </div>
            ) : (
              <div className="space-y-3">
                {notifications.map((notification) => (
                  <NotificationRow
                    key={notification.id}
                    icon={notification.icon}
                    title={notification.title}
                    body={notification.body}
                    tone={notification.tone}
                  />
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
