import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Bell, ClipboardList, FileBarChart, Gauge, LogOut, Menu, Settings, ShieldAlert, UserRound, X } from "lucide-react";
import { useState } from "react";
import logo from "@/assets/onepws-white-logo-scaled.png";
import { Button } from "@/components/ui/Button";
import { useCurrentUser, useLogout } from "@/hooks/useAuth";
import { cn } from "@/lib/cn";

const nav = [
  { to: "/", label: "Dashboard", icon: Gauge },
  { to: "/complaints", label: "Complaints", icon: ClipboardList },
  { to: "/capa-tracker", label: "CAPA Tracker", icon: ShieldAlert },
  { to: "/reports", label: "Reports", icon: FileBarChart },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/profile", label: "Profile", icon: UserRound },
  { to: "/settings", label: "Master Data", icon: Settings }
];

export function AppShell() {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const { data } = useCurrentUser();
  const logout = useLogout();

  async function onLogout() {
    await logout.mutateAsync();
    navigate("/login");
  }

  const sidebar = (
    <aside className={cn("flex h-full flex-col bg-brand-charcoal text-white transition-all", collapsed ? "w-20" : "w-72")}>
      <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
        <img src={logo} alt="ONEPWS" className={cn("h-auto", collapsed ? "w-11 object-left object-contain" : "w-40")} />
        <Button
          variant="ghost"
          className="hidden h-9 w-9 border-white/10 px-0 text-white hover:bg-white/10 lg:inline-flex"
          onClick={() => setCollapsed((value) => !value)}
          aria-label="Toggle sidebar"
        >
          <Menu className="h-4 w-4" />
        </Button>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              cn(
                "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-slate-200 hover:bg-white/10 hover:text-white",
                isActive && "bg-brand-red text-white"
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed ? <span>{item.label}</span> : null}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        {!collapsed ? (
          <div className="mb-3 rounded-lg bg-white/5 p-3">
            <p className="truncate text-sm font-bold">{data?.user.name}</p>
            <p className="truncate text-xs text-slate-300">{data?.user.role?.name || "Authorized user"}</p>
          </div>
        ) : null}
        <Button variant="ghost" className="w-full justify-start border-white/10 text-white hover:bg-white/10" onClick={onLogout}>
          <LogOut className="h-4 w-4" />
          {!collapsed ? "Logout" : null}
        </Button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:block">{sidebar}</div>
      <div className={cn("min-h-screen transition-all", collapsed ? "lg:pl-20" : "lg:pl-72")}>
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
          <Button variant="ghost" className="h-9 w-9 px-0 lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">
            <Menu className="h-5 w-5" />
          </Button>
          <div>
            <p className="text-sm font-bold text-brand-charcoal">Complaint & CAPA Management</p>
            <p className="text-xs text-slate-500">Server-backed MERN foundation</p>
          </div>
          <div className="flex items-center gap-2 text-right">
            <div className="hidden sm:block">
              <p className="text-sm font-semibold text-slate-800">{data?.user.name}</p>
              <p className="text-xs text-slate-500">{data?.user.username}</p>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-red-50 text-brand-red">
              <UserRound className="h-4 w-4" />
            </div>
          </div>
        </header>
        <Outlet />
      </div>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button className="absolute inset-0 bg-slate-950/40" onClick={() => setOpen(false)} aria-label="Close navigation backdrop" />
          <div className="absolute inset-y-0 left-0 w-72 shadow-soft">
            <Button
              variant="ghost"
              className="absolute right-3 top-3 z-10 h-9 w-9 border-white/10 px-0 text-white hover:bg-white/10"
              onClick={() => setOpen(false)}
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
