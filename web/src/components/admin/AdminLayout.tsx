import { useEffect, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { CalendarCheck, LayoutDashboard, LogOut, MapPin, Truck, Users } from "lucide-react";
import { adminSession } from "@/lib/admin-api";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/admin" as const, label: "Overview", icon: LayoutDashboard },
  { to: "/admin/bookings" as const, label: "Bookings", icon: CalendarCheck },
  { to: "/admin/patients" as const, label: "Patients", icon: Users },
  { to: "/admin/phlebotomists" as const, label: "Phlebotomists", icon: Truck },
  { to: "/admin/collection-centers" as const, label: "Collection Centers", icon: MapPin },
];

export function AdminLayout({ children, activePath }: { children: ReactNode; activePath: string }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!adminSession.getToken()) {
      navigate({ to: "/admin/login" });
    }
  }, [navigate]);

  const admin = adminSession.getAdmin();

  return (
    <div className="min-h-screen bg-muted">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card p-4 lg:flex">
          <div className="flex items-center gap-2.5 px-2 pb-6">
            <img src="/logo.png" alt="MD Path Lab" className="h-9 w-9 rounded-full object-contain" />
            <div>
              <p className="text-sm font-extrabold text-primary">MD Path Lab</p>
              <p className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">Admin Panel</p>
            </div>
          </div>

          <nav className="flex-1 space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors",
                  activePath === item.to
                    ? "bg-primary-soft text-primary"
                    : "text-foreground/75 hover:bg-muted hover:text-foreground",
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="border-t border-border pt-3">
            <p className="px-3.5 text-xs font-bold">{admin?.name}</p>
            <p className="px-3.5 text-[11px] text-muted-foreground">{admin?.email}</p>
            <button
              onClick={() => {
                adminSession.clear();
                navigate({ to: "/admin/login" });
              }}
              className="mt-2 flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-destructive/85 hover:bg-destructive/10"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              Log out
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
