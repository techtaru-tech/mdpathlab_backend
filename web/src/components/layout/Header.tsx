import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Headphones, MapPin, Menu, User, X } from "lucide-react";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { LocationModal } from "@/components/layout/LocationModal";

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

export function Header() {
  const [open, setOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [city, setCity] = useState("Delhi NCR");

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

            <Link to="/login" className="flex items-center gap-2.5 px-6">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-primary-soft text-primary">
                <User className="h-4 w-4" />
              </span>
              <span className="text-sm font-bold">Login / Signup</span>
            </Link>

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
              <Link
                to="/login"
                onClick={() => setOpen(false)}
                className="mt-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-foreground/85 transition-colors hover:bg-primary-soft hover:text-primary"
              >
                Login / Signup
              </Link>
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
