import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Building2, ExternalLink, FileText, LayoutDashboard, LogOut, Menu, QrCode, Wallet, X } from "lucide-react";
import { useStoredAccount } from "@/lib/useStoredAccount";
import { partnerApi, partnerSession } from "@/lib/partner-api";
import { cn } from "@/lib/utils";

// Same shell as the partner-lab dashboard (LabLayout): sidebar on desktop, drawer on mobile.
export const partnerNavItems = [
  { to: "/partner" as const, label: "Overview", icon: LayoutDashboard },
  { to: "/partner/register" as const, label: "Application", icon: FileText },
  { to: "/partner/affiliations" as const, label: "Clinic affiliations", icon: Building2 },
  { to: "/partner/referral-kit" as const, label: "Referral kit", icon: QrCode },
  { to: "/partner/earnings" as const, label: "Earnings", icon: Wallet },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/logo.png" alt="MD Path Lab" className="h-9 w-9 shrink-0 rounded-full object-contain" />
      <div className="min-w-0">
        <p className="truncate text-sm font-extrabold text-primary">MD Path Lab</p>
        <p className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">Doctors &amp; Clinics</p>
      </div>
    </div>
  );
}

function NavList({ activePath, onNavigate }: { activePath: string; onNavigate?: () => void }) {
  return (
    <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto">
      {partnerNavItems.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-3 rounded-xl border-l-[3px] px-3.5 py-2.5 text-sm font-semibold transition-colors",
            activePath === item.to
              ? "border-primary bg-primary-soft text-primary"
              : "border-transparent text-foreground/75 hover:bg-muted hover:text-foreground",
          )}
        >
          <item.icon className="h-4 w-4 shrink-0" />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function AccountFooter({ onLogout }: { onLogout: () => void }) {
  const partner = useStoredAccount(() => partnerSession.getPartner());
  return (
    <div className="border-t border-border pt-3">
      <p className="truncate px-3.5 text-xs font-bold">{partner?.displayName || (partner?.type === "CLINIC" ? "Clinic account" : "Doctor account")}</p>
      <p className="truncate px-3.5 text-[11px] text-muted-foreground">+91 {partner?.phone}</p>
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

function TopbarAccount() {
  const partner = useStoredAccount(() => partnerSession.getPartner());
  const name = partner?.displayName || (partner?.type === "CLINIC" ? "Clinic account" : "Doctor account");
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-primary-soft text-xs font-extrabold text-primary">
        {name
          .replace(/^dr\.?\s+/i, "")
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((w) => w[0]!.toUpperCase())
          .join("")}
      </span>
      <span className="text-left">
        <span className="block max-w-[12rem] truncate text-xs font-bold">{name}</span>
        <span className="block text-[10px] text-muted-foreground">{partner?.type === "CLINIC" ? "Clinic / Hospital" : "Doctor"}</span>
      </span>
    </div>
  );
}

export function PartnerLayout({ children, activePath }: { children: ReactNode; activePath: string }) {
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!partnerSession.getToken()) navigate({ to: "/partner/login" });
  }, [navigate]);

  function handleLogout() {
    partnerApi.logout().catch(() => {});
    partnerSession.clear();
    navigate({ to: "/partner/login" });
  }

  const activeLabel = partnerNavItems.find((n) => n.to === activePath)?.label ?? "Partner";

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 lg:hidden">
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
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-card p-4 shadow-sm lg:flex">
          <div className="px-2 pb-6">
            <Brand />
          </div>
          <NavList activePath={activePath} />
          <AccountFooter onLogout={handleLogout} />
        </aside>

        <main className="min-w-0 flex-1">
          <div className="sticky top-0 z-30 hidden items-center justify-between gap-4 border-b border-border bg-card/95 px-8 py-3 backdrop-blur lg:flex">
            <p className="text-xs font-semibold text-muted-foreground">Partner / {activeLabel}</p>
            <div className="flex items-center gap-4">
              <a href="/" className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary">
                <ExternalLink className="h-3.5 w-3.5" /> MD Path Lab website
              </a>
              <TopbarAccount />
            </div>
          </div>
          <div className="p-4 sm:p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}

/** Shown in place of a page while doctor registration is switched off in admin settings (the API answers 404 to everything else). */
export function PartnerPortalClosed() {
  return (
    <section className="flex min-h-screen items-center bg-muted/40 py-16">
      <div className="container-page mx-auto w-full max-w-md">
        <div className="surface-card p-8 text-center shadow-[var(--shadow-lift)]">
          <img src="/logo.png" alt="MD Path Lab" className="mx-auto h-12 w-12 rounded-full object-contain" />
          <h1 className="mt-5 text-xl font-extrabold">Registration for doctors and clinics is not open yet</h1>
          <p className="mt-2 text-sm text-muted-foreground">Please check back soon, or contact us if you would like to partner with MD Path Labs.</p>
          <Link to="/" className="mt-6 inline-block text-sm font-bold text-primary hover:underline">
            Back to home
          </Link>
        </div>
      </div>
    </section>
  );
}

// One request per page load, shared by the header's "Join as Partner" button and the partner pages.
let availabilityRequest: Promise<boolean> | null = null;

/** Loads the portal's availability once; null while loading. */
export function usePartnerPortalEnabled(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    availabilityRequest ??= partnerApi
      .availability()
      .then((r) => r.enabled)
      .catch(() => {
        availabilityRequest = null; // try again on the next page rather than hiding it for good
        return false;
      });
    availabilityRequest.then(setEnabled);
  }, []);
  return enabled;
}
