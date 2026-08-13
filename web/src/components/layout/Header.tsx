import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { Bell, ChevronDown, Headphones, LayoutDashboard, LogOut, MapPin, Menu, ShoppingCart, User, X } from "lucide-react";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { LocationModal } from "@/components/layout/LocationModal";
import { cartApi, ordersApi, session } from "@/lib/api";
import { onCartChanged } from "@/lib/cartEvents";
import { deriveNotifications, type NotificationEntry } from "@/lib/notifications";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const navLinks = [
  { label: "Home", to: "/" as const, anchor: null },
  { label: "Popular Test", to: "/tests" as const, anchor: null },
  { label: "Popular Package", to: "/packages" as const, anchor: null },
  { label: "Lifestyle Disorder", to: "/lifestyle-disorders" as const, anchor: null },
  { label: "About Us", to: "/about" as const, anchor: null },
  { label: "Blog", to: "/blog" as const, anchor: null },
  { label: "Franchise", to: "/franchise" as const, anchor: null },
  { label: "Contact Us", to: "/contact" as const, anchor: null },
];

function handleLogout() {
  session.clear();
  window.location.href = "/";
}

function formatRelativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function Header() {
  const [open, setOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [city, setCity] = useState("Delhi NCR");
  const [cartCount, setCartCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);
  // Starts null to match the server-rendered markup (no access to localStorage there), then
  // fills in after mount — reading session.getUser() directly during render would render one
  // tree on the server and a different one on the client, which is a real hydration mismatch,
  // not just a cosmetic flash.
  const [user, setUser] = useState<ReturnType<typeof session.getUser>>(null);

  useEffect(() => {
    const current = session.getUser();
    setUser(current);
    if (!current) return;
    const refreshCart = () => cartApi.list().then((res) => setCartCount(res.items.length)).catch(() => {});
    refreshCart();
    const unsubscribe = onCartChanged(refreshCart);
    ordersApi
      .list()
      .then((orders) => setNotifications(deriveNotifications(orders)))
      .catch(() => {});
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <header className="sticky top-0 z-50 shadow-[var(--shadow-soft)]">
      {/* Utility row */}
      <div className="bg-card">
        <div className="container-page flex h-16 items-center justify-between gap-4 lg:h-20">
          <a href="#top" className="flex min-w-0 items-center gap-2.5">
            <img
              src="/logo.png"
              alt="MD Path Lab"
              className="h-11 w-11 shrink-0 rounded-full object-contain"
            />
            <span className="min-w-0">
              <span className="block truncate text-xl leading-none font-extrabold tracking-tight text-primary">
                MD <span className="text-secondary">Path Lab</span>
              </span>
              <span className="hidden text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase sm:block">
                Madhumesh Diagnostics
              </span>
            </span>
          </a>

          <div className="hidden items-center divide-x divide-border lg:flex">
            <button
              onClick={() => setLocationOpen(true)}
              className="flex items-center gap-2.5 pr-6 text-left"
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-primary-soft text-primary">
                <MapPin className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-[11px] text-muted-foreground">Your location</span>
                <span className="flex items-center gap-1 text-sm font-bold">
                  {city} <ChevronDown className="h-3.5 w-3.5" />
                </span>
              </span>
            </button>

            {user ? (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger className="relative flex items-center px-5 outline-none" aria-label="Notifications">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-primary-soft text-primary">
                      <Bell className="h-4 w-4" />
                    </span>
                    {notifications.length > 0 ? (
                      <span className="absolute top-1.5 right-3 h-2 w-2 rounded-full bg-destructive" />
                    ) : null}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-80">
                    <div className="px-2 py-1.5 text-xs font-bold tracking-wide text-muted-foreground uppercase">Activity</div>
                    {notifications.length === 0 ? (
                      <p className="px-2 py-3 text-sm text-muted-foreground">No updates yet.</p>
                    ) : (
                      <div className="max-h-80 overflow-y-auto">
                        {notifications.map((n) => (
                          <div key={n.id} className="rounded-sm px-2 py-2 text-sm hover:bg-accent">
                            <p className="font-semibold">{n.title}</p>
                            {n.detail ? <p className="mt-0.5 text-xs text-muted-foreground">{n.detail}</p> : null}
                            <p className="mt-0.5 text-[11px] text-muted-foreground">{formatRelativeTime(n.createdAt)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-1 border-t border-border px-2 pt-2 text-[11px] text-muted-foreground">
                      In-app activity — SMS/WhatsApp alerts aren't connected yet.
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Link to="/cart" className="relative flex items-center px-5" aria-label="Cart">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-primary-soft text-primary">
                    <ShoppingCart className="h-4 w-4" />
                  </span>
                  {cartCount > 0 ? (
                    <span className="absolute top-1 right-3 grid h-4.5 w-4.5 place-items-center rounded-full bg-secondary text-[10px] font-bold text-secondary-foreground">
                      {cartCount}
                    </span>
                  ) : null}
                </Link>
              </>
            ) : null}

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-2.5 px-6 outline-none">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-primary-soft text-primary">
                    <User className="h-4 w-4" />
                  </span>
                  <span className="flex items-center gap-1 text-left">
                    <span className="block max-w-[9rem] truncate text-sm font-bold">{user.name || user.phone}</span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    onClick={() => (window.location.href = "/dashboard")}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <LayoutDashboard className="h-4 w-4" /> My Dashboard
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleLogout} className="flex items-center gap-2 cursor-pointer text-destructive">
                    <LogOut className="h-4 w-4" /> Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link to="/login" className="flex items-center gap-2.5 px-6">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-primary-soft text-primary">
                  <User className="h-4 w-4" />
                </span>
                <span className="text-sm font-bold">Login / Signup</span>
              </Link>
            )}

            <a href="tel:8400100800" className="flex items-center gap-2.5 pl-6 text-left">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-primary-soft text-primary">
                <Headphones className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-[11px] text-muted-foreground">Customer support</span>
                <span className="block text-sm font-bold">8400100800</span>
              </span>
            </a>
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <ActionButton variant="primary" size="sm">
              Book
            </ActionButton>
            <button
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => setOpen((v) => !v)}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-card text-primary"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Category nav bar */}
      <nav className="hidden bg-primary text-primary-foreground lg:block">
        <div className="container-page flex h-12 items-center gap-1 overflow-x-auto">
          {navLinks.map((link) =>
            link.anchor ? (
              <a
                key={link.label}
                href={link.anchor}
                className="flex shrink-0 items-center rounded-md px-3.5 py-2 text-sm font-semibold transition-colors hover:bg-primary-deep"
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.label}
                to={link.to!}
                className="flex shrink-0 items-center rounded-md px-3.5 py-2 text-sm font-semibold transition-colors hover:bg-primary-deep"
              >
                {link.label}
              </Link>
            ),
          )}
        </div>
      </nav>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-border bg-card lg:hidden"
          >
            <div className="container-page flex flex-col gap-1 py-4">
              {navLinks.map((link) =>
                link.anchor ? (
                  <a
                    key={link.label}
                    href={link.anchor}
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-3 py-2.5 text-sm font-semibold text-foreground/85 transition-colors hover:bg-primary-soft hover:text-primary"
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link
                    key={link.label}
                    to={link.to!}
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-3 py-2.5 text-sm font-semibold text-foreground/85 transition-colors hover:bg-primary-soft hover:text-primary"
                  >
                    {link.label}
                  </Link>
                ),
              )}
              {user ? (
                <>
                  <Link
                    to="/cart"
                    onClick={() => setOpen(false)}
                    className="mt-2 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-foreground/85 transition-colors hover:bg-primary-soft hover:text-primary"
                  >
                    <ShoppingCart className="h-4 w-4" /> Cart {cartCount > 0 ? `(${cartCount})` : ""}
                  </Link>
                  <Link
                    to="/dashboard"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-foreground/85 transition-colors hover:bg-primary-soft hover:text-primary"
                  >
                    <LayoutDashboard className="h-4 w-4" /> My Dashboard ({user.name || user.phone})
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <LogOut className="h-4 w-4" /> Log out
                  </button>
                </>
              ) : (
                <Link
                  to="/login"
                  onClick={() => setOpen(false)}
                  className="mt-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-foreground/85 transition-colors hover:bg-primary-soft hover:text-primary"
                >
                  Login / Signup
                </Link>
              )}
              <a
                href="tel:8400100800"
                className="mt-2 rounded-lg bg-primary-soft px-3 py-2.5 text-sm font-bold text-primary"
              >
                Call 8400100800
              </a>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <LocationModal
        open={locationOpen}
        onOpenChange={setLocationOpen}
        selected={city}
        onSelect={setCity}
      />
    </header>
  );
}
