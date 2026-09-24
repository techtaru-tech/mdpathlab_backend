import { useEffect, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { CalendarCheck, FlaskConical, LogOut, Truck } from "lucide-react";
import { labSession } from "@/lib/lab-api";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/lab" as const, label: "Bookings", icon: CalendarCheck },
  { to: "/lab/phlebotomists" as const, label: "Phlebotomists", icon: Truck },
  { to: "/lab/catalogue" as const, label: "Tests & Packages", icon: FlaskConical },
];

export function LabLayout({ children, activePath }: { children: ReactNode; activePath: string }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!labSession.getToken()) {
      navigate({ to: "/lab/login" });
    }
  }, [navigate]);

  const lab = labSession.getLab();

  function handleLogout() {
    labSession.clear();
    navigate({ to: "/lab/login" });
  }

  return (
    <div className="flex min-h-screen bg-muted/40">
      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-border bg-card p-4 shadow-sm">
        <div className="px-2 pb-6">
          <p className="text-sm font-extrabold text-primary">MD Path Lab</p>
          <p className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">Partner Lab Dashboard</p>
        </div>
        <nav className="flex-1 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded-xl border-l-[3px] px-3.5 py-2.5 text-sm font-semibold transition-colors",
                activePath === item.to
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-transparent text-foreground/75 hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon className="h-4.5 w-4.5 shrink-0" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-border pt-3">
          <p className="truncate px-3.5 text-xs font-bold">{lab?.name}</p>
          <p className="truncate px-3.5 text-[11px] text-muted-foreground">{lab?.email}</p>
          <button
            onClick={handleLogout}
            className="mt-2 flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-destructive/85 hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Log out
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1 p-6 lg:p-8">{children}</div>
    </div>
  );
}
