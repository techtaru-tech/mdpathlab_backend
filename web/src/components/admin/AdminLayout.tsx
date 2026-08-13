import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { CalendarCheck, LayoutDashboard, LogOut, MapPin, Menu, Percent, Truck, Users, X } from "lucide-react";
import { adminSession } from "@/lib/admin-api";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/admin" as const, label: "Overview", icon: LayoutDashboard },
  { to: "/admin/bookings" as const, label: "Bookings", icon: CalendarCheck },
  { to: "/admin/patients" as const, label: "Patients", icon: Users },
  { to: "/admin/phlebotomists" as const, label: "Phlebotomists", icon: Truck },
  { to: "/admin/collection-centers" as const, label: "Collection Centers", icon: MapPin },
  { to: "/admin/offers" as const, label: "Offers", icon: Percent },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/logo.png" alt="MD Path Lab" className="h-9 w-9 shrink-0 rounded-full object-contain" />
      <div className="min-w-0">
        <p className="truncate text-sm font-extrabold text-primary">MD Path Lab</p>
        <p className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">Admin Panel</p>
      </div>
    </div>
  );
}

function NavList({ activePath, onNavigate }: { activePath: string; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 space-y-1">
      {navItems.map((item) => {
        const isActive = activePath === item.to;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-xl border-l-[3px] px-3.5 py-2.5 text-sm font-semibold transition-colors",
              isActive
                ? "border-primary bg-primary-soft text-primary"
                : "border-transparent text-foreground/75 hover:bg-muted hover:text-foreground",
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function AccountFooter({ onLogout }: { onLogout: () => void }) {
  const admin = adminSession.getAdmin();
  return (
    <div className="border-t border-border pt-3">
      <p className="truncate px-3.5 text-xs font-bold">{admin?.name}</p>
      <p className="truncate px-3.5 text-[11px] text-muted-foreground">{admin?.email}</p>
      <button
        onClick={onLogout}
        className="mt-2 flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-destructive/85 hover:bg-destructive/10"
      >
        <LogOut className="h-4 w-4 shrink-0" />
        Log out
      </button>
    </div>
  );
}

export function AdminLayout({ children, activePath }: { children: ReactNode; activePath: string }) {
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!adminSession.getToken()) {
      navigate({ to: "/admin/login" });
    }
  }, [navigate]);

  function handleLogout() {
    adminSession.clear();
    navigate({ to: "/admin/login" });
  }

  const activeLabel = navItems.find((n) => n.to === activePath)?.label ?? "Admin";

  return (
    <div className="min-h-screen bg-muted/40">
      {/* Mobile top bar */}
      <header className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 lg:hidden">
        <Brand />
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setDrawerOpen(true)}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border text-foreground"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {/* Mobile drawer */}
      <div
        className={cn(
          "fixed inset-0 z-50 bg-black/40 transition-opacity lg:hidden",
          drawerOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setDrawerOpen(false)}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-card p-4 transition-transform duration-300 ease-out lg:hidden",
          drawerOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between gap-2 pb-6">
          <Brand />
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
        <NavList activePath={activePath} onNavigate={() => setDrawerOpen(false)} />
        <AccountFooter onLogout={handleLogout} />
      </aside>

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-card p-4 shadow-sm lg:flex">
          <div className="px-2 pb-6">
            <Brand />
          </div>
          <NavList activePath={activePath} />
          <AccountFooter onLogout={handleLogout} />
        </aside>

        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          <p className="mb-1 hidden text-xs font-semibold text-muted-foreground lg:block" aria-hidden>
            Admin / {activeLabel}
          </p>
          {children}
        </main>
      </div>
    </div>
  );
}
