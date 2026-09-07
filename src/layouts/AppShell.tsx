import { useEffect, useMemo, useState, type ComponentType } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  ClipboardList,
  Database,
  FileBarChart,
  Gauge,
  History,
  LogOut,
  Mail,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Repeat2,
  Settings,
  ShieldCheck,
  Timer,
  UploadCloud,
  UserRound,
  X
} from "lucide-react";
import logo from "@/assets/onepws-white-logo-scaled.png";
import { Button } from "@/components/ui/Button";
import { useLogout } from "@/hooks/useAuth";
import { useNotifications, usePermissions, type Permissions } from "@/services/queries";
import { cn } from "@/lib/cn";

type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  visible: (permissions: Permissions) => boolean;
  end?: boolean;
};

type NavGroup = { heading: string; items: NavItem[] };

const canView = (permissions: Permissions) => permissions.can("view.company") || permissions.can("view.all");

const NAV: NavGroup[] = [
  {
    heading: "Overview",
    items: [
      { to: "/", label: "Dashboard", icon: Gauge, visible: canView, end: true },
      { to: "/notifications", label: "Notifications", icon: Bell, visible: () => true }
    ]
  },
  {
    heading: "Complaints",
    items: [
      { to: "/complaints", label: "Complaints", icon: ClipboardList, visible: canView },
      { to: "/tat", label: "TAT Dashboard", icon: Timer, visible: canView },
      { to: "/repeat", label: "Repeat Analysis", icon: Repeat2, visible: canView }
    ]
  },
  {
    heading: "CAPA",
    items: [
      { to: "/capa", label: "CAPA Dashboard", icon: ShieldCheck, visible: canView, end: true },
      { to: "/capa/tracker", label: "CAPA Tracker", icon: ClipboardList, visible: canView },
      { to: "/capa/master", label: "CAPA Master List", icon: Database, visible: canView }
    ]
  },
  {
    heading: "Governance",
    items: [
      { to: "/reports", label: "Reports", icon: FileBarChart, visible: (permissions) => permissions.can("report.all") || canView(permissions) },
      { to: "/audit", label: "Audit Trail", icon: History, visible: (permissions) => permissions.can("audit.view") },
      {
        to: "/import-export",
        label: "Import / Export",
        icon: UploadCloud,
        visible: (permissions) => permissions.isMasterAdmin || permissions.can("complaint.create") || permissions.can("export.all")
      },
      { to: "/master-data", label: "Master Data", icon: Settings, visible: (permissions) => permissions.isMasterAdmin },
      { to: "/email-admin", label: "Email Automation", icon: Mail, visible: (permissions) => permissions.isMasterAdmin }
    ]
  }
];


export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const permissions = usePermissions();
  const logout = useLogout();
  const notifications = useNotifications({ pageSize: 1 });

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const groups = useMemo(
    () => NAV.map((group) => ({ ...group, items: group.items.filter((item) => item.visible(permissions)) })).filter((group) => group.items.length > 0),
    [permissions]
  );

  async function onLogout() {
    await logout.mutateAsync();
    navigate("/login");
  }

  const unread = notifications.data?.unread ?? 0;

  const sidebar = (
    <aside className={cn("flex h-full flex-col bg-brand-charcoal text-white transition-[width]", collapsed ? "w-20" : "w-64")}>
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-white/10 px-4">
        <img src={logo} alt="ONEPWS" className={cn("h-auto object-contain object-left", collapsed ? "w-10" : "w-36")} />
        <Button
          variant="ghost"
          className="hidden h-9 w-9 border-white/10 px-0 text-white hover:bg-white/10 lg:inline-flex"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto p-3">
        {groups.map((group) => (
          <div key={group.heading}>
            {!collapsed ? (
              <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{group.heading}</p>
            ) : null}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        "flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white",
                        collapsed && "justify-center px-0",
                        isActive && "bg-brand-red text-white hover:bg-brand-red"
                      )
                    }
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed ? <span className="truncate">{item.label}</span> : null}
                    {!collapsed && item.to === "/notifications" && unread > 0 ? (
                      <span className="ml-auto rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-brand-red">{unread}</span>
                    ) : null}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-white/10 p-3">
        {!collapsed ? (
          <div className="mb-2 rounded-lg bg-white/5 p-3">
            <p className="truncate text-sm font-bold">{permissions.user?.name}</p>
            <p className="truncate text-xs text-slate-300">{permissions.roleName || "Authorized user"}</p>
          </div>
        ) : null}
        <Button
          variant="ghost"
          className={cn("w-full border-white/10 text-white hover:bg-white/10", collapsed ? "justify-center px-0" : "justify-start")}
          onClick={onLogout}
          disabled={logout.isPending}
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" />
          {!collapsed ? (logout.isPending ? "Signing out" : "Sign out") : null}
        </Button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50">
      <div className="fixed inset-y-0 left-0 z-40 hidden lg:block">{sidebar}</div>

      <div className={cn("flex min-h-screen flex-col transition-[padding]", collapsed ? "lg:pl-20" : "lg:pl-64")}>
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 sm:px-6">
          <Button variant="ghost" className="h-10 w-10 px-0 lg:hidden" onClick={() => setDrawerOpen(true)} aria-label="Open navigation">
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-brand-charcoal">Complaint &amp; CAPA Management</p>
            <p className="hidden truncate text-xs text-slate-500 sm:block">Quality management system</p>
          </div>
          <NavLink
            to="/notifications"
            className="relative grid h-10 w-10 place-items-center rounded-lg text-slate-600 hover:bg-slate-100"
            aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          >
            <Bell className="h-5 w-5" />
            {unread > 0 ? (
              <span className="absolute right-1 top-1 min-w-[16px] rounded-full bg-brand-red px-1 text-[10px] font-bold leading-4 text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </NavLink>
          <NavLink to="/profile" className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-slate-100" aria-label="Profile">
            <span className="hidden text-right sm:block">
              <span className="block text-sm font-semibold text-slate-800">{permissions.user?.name}</span>
              <span className="block text-xs text-slate-500">{permissions.roleName}</span>
            </span>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-red-50 text-brand-red">
              <UserRound className="h-4 w-4" />
            </span>
          </NavLink>
        </header>

        <div className="flex-1">
          <Outlet />
        </div>
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-slate-950/50" onClick={() => setDrawerOpen(false)} aria-label="Close navigation" />
          <div className="absolute inset-y-0 left-0 w-64 max-w-[85vw] shadow-soft">
            <Button
              variant="ghost"
              className="absolute right-2 top-3 z-10 h-9 w-9 border-white/10 px-0 text-white hover:bg-white/10"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </Button>
            {sidebar}
          </div>
        </div>
      ) : null}
    </div>
  );
}
