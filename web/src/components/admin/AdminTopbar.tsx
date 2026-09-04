import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, ChevronDown, FileText, LogOut, Search, Truck } from "lucide-react";
import { navItems } from "@/components/admin/AdminLayout";
import { adminDashboardApi, adminSession, type AdminAlerts } from "@/lib/admin-api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function initials(name: string | undefined | null, email: string | undefined | null) {
  const source = name?.trim() || email?.trim() || "A";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function NavSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = query.trim()
    ? navItems.filter((n) => n.label.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : [];

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") {
        inputRef.current?.blur();
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, []);

  function go(to: (typeof navItems)[number]["to"]) {
    setQuery("");
    setOpen(false);
    navigate({ to });
  }

  return (
    <div className="relative w-full max-w-sm">
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder="Search pages…"
        className="h-10 w-full rounded-xl border border-border bg-muted/60 pr-14 pl-9 text-sm font-medium placeholder:text-muted-foreground focus:border-primary/40 focus:bg-card focus:outline-none"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded-md border border-border bg-card px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
        /
      </kbd>

      {open && query.trim() ? (
        <div className="absolute top-full left-0 z-40 mt-2 w-full overflow-hidden rounded-xl border border-border bg-card py-1.5 shadow-lg">
          {results.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-muted-foreground">No pages match "{query}"</p>
          ) : (
            results.map((item) => (
              <button
                key={item.to}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  go(item.to);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-semibold hover:bg-muted"
              >
                <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                {item.label}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

export function AdminTopbar({ activeLabel }: { activeLabel: string }) {
  const navigate = useNavigate();
  const admin = adminSession.getAdmin();
  const [alerts, setAlerts] = useState<AdminAlerts | null>(null);

  useEffect(() => {
    adminDashboardApi.alerts().then(setAlerts).catch(() => {});
  }, []);

  function handleLogout() {
    adminSession.clear();
    navigate({ to: "/admin/login" });
  }

  const alertCount = (alerts?.pendingAssignment ?? 0) + (alerts?.pendingReportsApproval ?? 0);

  return (
    <div className="sticky top-0 z-30 hidden border-b border-border bg-card/95 px-4 py-3 backdrop-blur sm:px-6 lg:flex lg:items-center lg:gap-4 lg:px-8">
      <p className="shrink-0 text-xs font-semibold text-muted-foreground">Admin / {activeLabel}</p>

      <div className="flex flex-1 justify-center">
        <NavSearch />
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger className="relative grid h-10 w-10 place-items-center rounded-full text-muted-foreground outline-none hover:bg-muted" aria-label="Notifications">
            <Bell className="h-4.5 w-4.5" />
            {alertCount > 0 ? (
              <span className="absolute top-1.5 right-1.5 grid h-4 w-4 place-items-center rounded-full bg-foreground text-[9px] font-bold text-background">
                {alertCount > 9 ? "9+" : alertCount}
              </span>
            ) : null}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <div className="px-2 py-1.5 text-xs font-bold tracking-wide text-muted-foreground uppercase">Needs attention</div>
            {alertCount === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">All caught up — nothing pending.</p>
            ) : (
              <>
                {alerts && alerts.pendingAssignment > 0 ? (
                  <DropdownMenuItem
                    onClick={() => navigate({ to: "/admin/bookings" })}
                    className="flex cursor-pointer items-center gap-2.5 py-2.5"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted">
                      <Truck className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">{alerts.pendingAssignment} booking(s) unassigned</span>
                      <span className="block text-xs text-muted-foreground">Confirmed but no phlebotomist yet</span>
                    </span>
                  </DropdownMenuItem>
                ) : null}
                {alerts && alerts.pendingReportsApproval > 0 ? (
                  <DropdownMenuItem
                    onClick={() => navigate({ to: "/admin/bookings" })}
                    className="flex cursor-pointer items-center gap-2.5 py-2.5"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted">
                      <FileText className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">{alerts.pendingReportsApproval} report(s) awaiting approval</span>
                      <span className="block text-xs text-muted-foreground">Uploaded but not yet released</span>
                    </span>
                  </DropdownMenuItem>
                ) : null}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-full py-1 pr-1 pl-1.5 outline-none hover:bg-muted">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-foreground text-xs font-bold text-background">
              {initials(admin?.name, admin?.email)}
            </span>
            <span className="hidden items-center gap-1 sm:flex">
              <span className="max-w-[9rem] truncate text-sm font-bold">{admin?.name || "Admin"}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5">
              <p className="truncate text-sm font-bold">{admin?.name}</p>
              <p className="truncate text-xs text-muted-foreground">{admin?.email}</p>
            </div>
            <DropdownMenuItem onClick={handleLogout} className="flex cursor-pointer items-center gap-2 text-destructive">
              <LogOut className="h-4 w-4" /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
