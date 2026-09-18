import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, ChevronDown, ChevronRight, Clock, Droplets, MapPin, PhoneCall } from "lucide-react";
import { useCategories } from "@/lib/categories";
import { iconForCategory, sortCategoriesFeaturedFirst } from "@/lib/categoryIcons";
import type { ApiCategory, CategoryItemPreview } from "@/lib/catalogue";
import { collectionCentresApi, type CollectionCentre } from "@/lib/api";

// Sidebar sections for the Full Body Checkup panel specifically — this category's dropdown
// follows a different, richer reference pattern (left sub-nav + switchable content) than every
// other category's plain package grid.
const FULL_BODY_SECTIONS = [
  "Popular Packages",
  "Blood Tests",
  "Tests by Unhealthy Habits",
  "Tests by Health Risks",
  "Govt. Panel Health Test",
  "Diagnostic Centre",
  "Health Tips",
] as const;
type FullBodySection = (typeof FULL_BODY_SECTIONS)[number];

// Real Profile rows under Full Body Checkup are tagged with these values (see
// scripts/seed-category-demo-tests.mjs) so each sub-nav section shows a genuinely different set
// of tests rather than the same list relabelled. "Popular Packages" and "Diagnostic Centre" pull
// from other real sources (packages, collection centers) and "Health Tips" is static advice copy,
// so only the plain test-name sections need a tag lookup.
const SECTION_TAG: Partial<Record<FullBodySection, string>> = {
  "Blood Tests": "blood-tests",
  "Tests by Unhealthy Habits": "unhealthy-habits",
  "Tests by Health Risks": "health-risks",
  "Govt. Panel Health Test": "govt-panel",
};

const HEALTH_TIPS = [
  "Get a full body checkup at least once a year, even without symptoms — many conditions develop silently.",
  "Fast for 10–12 hours before a blood sugar or lipid test for an accurate reading.",
  "Stay hydrated the day before your test — it makes sample collection easier and faster.",
  "Keep a copy of your past reports handy so your doctor can track changes over time.",
  "Mention any ongoing medication to the phlebotomist — some tests are sensitive to it.",
];

// Generic 3-bullet fallback for a category an admin hasn't written custom copy for yet — keeps
// every dropdown panel useful rather than blank, without inventing category-specific claims.
const DEFAULT_BULLETS = [
  "Regular screening catches risk factors before symptoms appear.",
  "Early detection makes most conditions far easier to manage.",
  "A simple test today can guide the right next step with your doctor.",
];

function ItemCard({ item, itemType }: { item: CategoryItemPreview; itemType: "PACKAGE" | "PARAMETER" | "PROFILE" }) {
  const discount = item.mrp > item.price ? Math.round(100 - (item.price / item.mrp) * 100) : 0;
  const to = itemType === "PACKAGE" ? "/packages/$slug" : "/tests/$slug";
  // The whole card is one link (covers "Know More") — a separate "Book now" button squeezed
  // alongside it at this width was overlapping/wrapping mid-word, so there's a single clear CTA
  // instead of two competing for the same narrow space.
  return (
    <Link
      to={to}
      params={{ slug: item.slug }}
      className="lift-on-hover flex h-full flex-col rounded-xl border border-border bg-card p-4 hover:border-primary/30"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
        <Droplets className="h-4 w-4" />
      </span>
      <p className="mt-2.5 line-clamp-2 min-h-[2.5rem] text-sm leading-snug font-bold">{item.name}</p>
      <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
        <span>
          {item.displayParameterCount} {item.displayParameterCount === 1 ? "test" : "tests"}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" /> {item.reportTimeHours <= 6 ? "Same day" : `${item.reportTimeHours} hrs`}
        </span>
      </div>
      <div className="mt-auto border-t border-border pt-3">
        <div className="flex items-baseline gap-2">
          <p className="text-lg font-extrabold text-primary">₹{item.price}</p>
          {discount > 0 ? <p className="text-xs text-muted-foreground line-through">₹{item.mrp}</p> : null}
        </div>
        {discount > 0 ? <p className="text-[11px] font-bold text-success">{discount}% off</p> : null}
        <span className="mt-2 block w-full rounded-lg bg-secondary py-1.5 text-center text-xs font-bold text-secondary-foreground">
          Book now
        </span>
      </div>
    </Link>
  );
}

function CategoryPanel({ category, onNavigate }: { category: ApiCategory; onNavigate: () => void }) {
  const bullets = (category.description?.trim() ? category.description.split("\n").filter(Boolean) : DEFAULT_BULLETS).slice(0, 4);
  const showingPackages = category.packages.length > 0;

  return (
    <div className="grid grid-cols-[240px_1fr] gap-6 p-6" onClick={onNavigate}>
      <div className="flex flex-col gap-4 border-r border-border pr-6">
        <div>
          <p className="text-sm font-extrabold">Why {category.name} checkups matter</p>
          <ul className="mt-3 space-y-2.5">
            {bullets.map((b, i) => (
              <li key={i} className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                {b}
              </li>
            ))}
          </ul>
        </div>
        <a
          href="tel:8400100800"
          className="mt-auto flex items-center justify-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-xs font-bold text-secondary-foreground"
        >
          <PhoneCall className="h-3.5 w-3.5" /> Talk to a Health Advisor
        </a>
      </div>

      <div>
        <p className="text-sm font-extrabold">
          {showingPackages ? `Preventive packages for ${category.name}` : `Popular tests for ${category.name}`}
        </p>
        {showingPackages ? (
          <div className="mt-3 grid grid-cols-3 gap-4">
            {category.packages.map((item) => (
              <ItemCard key={item.id} item={item} itemType="PACKAGE" />
            ))}
          </div>
        ) : category.tests.length > 0 ? (
          <div className="mt-3 grid grid-cols-3 gap-4">
            {category.tests.slice(0, 4).map((item) => (
              <ItemCard key={item.id} item={item} itemType={item.itemType} />
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            No tests listed under this category yet —{" "}
            <Link to="/tests" search={{ category: category.slug }} className="font-bold text-primary hover:underline">
              browse all tests
            </Link>{" "}
            instead.
          </p>
        )}
        <Link
          to="/tests"
          search={{ category: category.slug }}
          className="mt-4 inline-block text-xs font-bold text-primary hover:underline"
        >
          View all {category.name} tests →
        </Link>
      </div>
    </div>
  );
}

function MostBoughtRow({ item, onNavigate }: { item: CategoryItemPreview; onNavigate: () => void }) {
  const discount = item.mrp > item.price ? Math.round(100 - (item.price / item.mrp) * 100) : 0;
  return (
    <div className="border-b border-dashed border-border py-3 first:pt-0 last:border-0">
      <p className="text-sm font-bold leading-snug">{item.name}</p>
      <p className="mt-0.5 text-[11px] font-semibold text-primary">
        {item.displayParameterCount}+ tests included
      </p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <p className="text-base font-extrabold">₹{item.price}</p>
          {discount > 0 ? <p className="text-xs text-muted-foreground line-through">₹{item.mrp}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/packages/$slug"
            params={{ slug: item.slug }}
            onClick={onNavigate}
            className="rounded-lg bg-muted px-3 py-1.5 text-xs font-bold hover:bg-muted/70"
          >
            Know more
          </Link>
          <Link
            to="/packages/$slug"
            params={{ slug: item.slug }}
            onClick={onNavigate}
            className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-bold text-secondary-foreground"
          >
            Book now
          </Link>
        </div>
      </div>
    </div>
  );
}

function TrendingTile({ item, onNavigate }: { item: CategoryItemPreview; onNavigate: () => void }) {
  const discount = item.mrp > item.price ? Math.round(100 - (item.price / item.mrp) * 100) : 0;
  return (
    <Link
      to="/packages/$slug"
      params={{ slug: item.slug }}
      onClick={onNavigate}
      className="lift-on-hover rounded-xl border border-border bg-primary-soft/40 p-3"
    >
      <p className="line-clamp-2 min-h-[2.25rem] text-xs font-bold leading-snug">{item.name}</p>
      <p className="mt-1 text-[10px] font-semibold text-muted-foreground">
        {item.displayParameterCount}+ tests
      </p>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <p className="text-sm font-extrabold text-primary">₹{item.price}</p>
        {discount > 0 ? <p className="text-[10px] text-muted-foreground line-through">₹{item.mrp}</p> : null}
      </div>
    </Link>
  );
}

/** Plain 4-column grid of test names only — no pricing, matching the reference's "Blood Tests" pane. */
function PlainTestGrid({
  tests,
  category,
  onNavigate,
}: {
  tests: ApiCategory["tests"];
  category: ApiCategory;
  onNavigate: () => void;
}) {
  if (tests.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No individual tests listed yet —{" "}
        <Link to="/tests" search={{ category: category.slug }} onClick={onNavigate} className="font-bold text-primary hover:underline">
          browse all tests
        </Link>
        .
      </p>
    );
  }
  return (
    <div className="grid grid-cols-4 gap-x-6 gap-y-3">
      {tests.map((t) => (
        <Link
          key={t.id}
          to="/tests/$slug"
          params={{ slug: t.slug }}
          onClick={onNavigate}
          className="text-sm font-semibold text-foreground hover:text-primary hover:underline"
        >
          {t.name}
        </Link>
      ))}
    </div>
  );
}

/** Real collection centers (same data the booking flow uses) — no fabricated diagnostic-centre data. */
function DiagnosticCentrePane() {
  const [centres, setCentres] = useState<CollectionCentre[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    collectionCentresApi
      .list()
      .then((rows) => {
        if (!cancelled) setCentres(rows);
      })
      .catch(() => {
        if (!cancelled) setCentres([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (centres === null) return <p className="text-sm text-muted-foreground">Loading collection centres…</p>;
  if (centres.length === 0) return <p className="text-sm text-muted-foreground">No collection centres listed yet.</p>;

  return (
    <div className="grid grid-cols-2 gap-3">
      {centres.slice(0, 6).map((c) => (
        <div key={c.id} className="rounded-xl border border-border p-3">
          <p className="flex items-start gap-2 text-sm font-bold">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            {c.name}
          </p>
          <p className="mt-1 pl-6 text-xs text-muted-foreground">{c.address}</p>
          {c.phone ? <p className="mt-1 pl-6 text-xs font-semibold text-primary">{c.phone}</p> : null}
        </div>
      ))}
    </div>
  );
}

function HealthTipsPane() {
  return (
    <ul className="space-y-3">
      {HEALTH_TIPS.map((tip, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-foreground">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          {tip}
        </li>
      ))}
    </ul>
  );
}

/**
 * Full Body Checkup's dropdown follows a distinct, richer reference pattern from every other
 * category: a left sub-nav sidebar switches the right pane between a packages view ("Popular
 * Packages" — Most Bought list + Trending grid), plain test-name grids bucketed by the tests'
 * `tag` field (Blood Tests / Tests by Unhealthy Habits / Tests by Health Risks / Govt. Panel
 * Health Test), real collection-center data (Diagnostic Centre), and static advice copy (Health
 * Tips) — every section has a genuine backing source, nothing is a placeholder.
 */
function FullBodyCheckupPanel({ category, onNavigate }: { category: ApiCategory; onNavigate: () => void }) {
  const [section, setSection] = useState<FullBodySection>("Popular Packages");
  const sectionTag = SECTION_TAG[section];
  const sectionTests = sectionTag ? category.tests.filter((t) => t.tag === sectionTag) : [];

  return (
    <div className="grid grid-cols-[220px_1fr] gap-6 p-6">
      <div className="flex flex-col border-r border-border pr-4">
        {FULL_BODY_SECTIONS.map((s) => {
          const active = s === section;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setSection(s)}
              className={`flex items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-[13px] font-bold transition-colors ${
                active ? "border-l-2 border-primary bg-primary-soft/50 text-primary" : "text-foreground hover:bg-muted"
              }`}
            >
              {s}
              <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
            </button>
          );
        })}
      </div>

      <div>
        {section === "Popular Packages" ? (
          category.packages.length > 0 ? (
            <div className="grid grid-cols-[1.1fr_1fr] gap-8">
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-extrabold">Most Bought Packages</p>
                  <Link
                    to="/packages"
                    onClick={onNavigate}
                    className="text-[11px] font-bold text-primary hover:underline"
                  >
                    View all
                  </Link>
                </div>
                <div className="mt-1">
                  {category.packages.map((p) => (
                    <MostBoughtRow key={p.id} item={p} onNavigate={onNavigate} />
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-extrabold">Trending Packages</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {category.packages.map((p) => (
                    <TrendingTile key={p.id} item={p} onNavigate={onNavigate} />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No packages listed yet —{" "}
              <Link to="/tests" search={{ category: category.slug }} onClick={onNavigate} className="font-bold text-primary hover:underline">
                browse all tests
              </Link>
              .
            </p>
          )
        ) : section === "Diagnostic Centre" ? (
          <>
            <p className="text-sm font-extrabold">Diagnostic Centre</p>
            <div className="mt-3">
              <DiagnosticCentrePane />
            </div>
          </>
        ) : section === "Health Tips" ? (
          <>
            <p className="text-sm font-extrabold">Health Tips</p>
            <div className="mt-3">
              <HealthTipsPane />
            </div>
          </>
        ) : (
          <>
            <p className="text-sm font-extrabold">{section}</p>
            <div className="mt-3">
              <PlainTestGrid tests={sectionTests} category={category} onNavigate={onNavigate} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Health-category buttons for the primary nav bar — hovering (or clicking, for touch/keyboard)
 * one opens a two-column panel: an educational blurb + advisor CTA on the left, and a preview of
 * that category's packages (or, when it has none yet, its individual tests) on the right. Same
 * interaction pattern as competitor sites the client referenced, built with this app's own design
 * tokens rather than copying their visual design. Renders only the buttons/dropdowns themselves
 * (no <nav> wrapper) so Header.tsx can place them inline alongside the rest of the primary bar's
 * links, matching the reference screenshot's single bar rather than a second row underneath it.
 */
export function CategoryMegaMenu() {
  const categories = useCategories();
  const ordered = categories ? sortCategoriesFeaturedFirst(categories) : [];
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [offsetMap, setOffsetMap] = useState<Record<string, number>>({});
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpenSlug(null);
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenSlug(null);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  function scheduleClose() {
    closeTimer.current = setTimeout(() => setOpenSlug(null), 150);
  }
  function cancelClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }

  // Clamped against the viewport rather than just flipping between "flush with the trigger's
  // left edge" and "flush with its right edge" — for a trigger near the middle of a centered nav
  // bar, BOTH of those can overflow (flush-left runs off the right edge; flipping to flush-right
  // then runs the same too-wide panel off the LEFT edge instead, which is what was happening to
  // Thyroid/Diabetes/Pregnancy). The panel instead starts flush with the trigger by default and
  // only slides left/right by the minimum amount needed to stay fully on screen.
  function openMenu(slug: string, panelWidth: number) {
    const el = wrapperRefs.current[slug];
    if (el) {
      const rect = el.getBoundingClientRect();
      const margin = 16;
      const minLocalLeft = margin - rect.left;
      const maxLocalLeft = window.innerWidth - margin - panelWidth - rect.left;
      const offset = Math.min(maxLocalLeft, Math.max(minLocalLeft, 0));
      setOffsetMap((prev) => (prev[slug] === offset ? prev : { ...prev, [slug]: offset }));
    }
    setOpenSlug(slug);
  }

  if (ordered.length === 0) return null;

  return (
    <div className="flex items-center gap-0.5" ref={containerRef}>
      {ordered.map((c) => {
        const Icon = iconForCategory(c.slug);
        const isOpen = openSlug === c.slug;
        const isFullBody = c.slug === "full-body-checkup";
        const panelWidth = isFullBody ? 1040 : 920;
        const offset = offsetMap[c.slug] ?? 0;
        return (
          <div
            key={c.id}
            ref={(el) => {
              wrapperRefs.current[c.slug] = el;
            }}
            className="relative"
            onMouseEnter={() => {
              cancelClose();
              openMenu(c.slug, panelWidth);
            }}
            onMouseLeave={scheduleClose}
          >
            <button
              type="button"
              onClick={() => (isOpen ? setOpenSlug(null) : openMenu(c.slug, panelWidth))}
              className="flex shrink-0 items-center gap-1 rounded-md px-2 py-2 text-[13px] font-semibold whitespace-nowrap transition-colors hover:bg-primary-deep"
              aria-expanded={isOpen}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {c.name}
              <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>

            {isOpen ? (
              <div
                className={`absolute top-full z-40 mt-1 ${isFullBody ? "w-[1040px]" : "w-[920px]"} max-w-[95vw] rounded-2xl border border-border bg-card text-foreground shadow-[var(--shadow-lift)]`}
                style={{ left: offset }}
                onMouseEnter={cancelClose}
                onMouseLeave={scheduleClose}
              >
                {isFullBody ? (
                  <FullBodyCheckupPanel category={c} onNavigate={() => setOpenSlug(null)} />
                ) : (
                  <CategoryPanel category={c} onNavigate={() => setOpenSlug(null)} />
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
