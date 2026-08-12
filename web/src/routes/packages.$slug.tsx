import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileCheck2,
  MapPin,
  MessageCircle,
  Phone,
  ShieldCheck,
  Star,
  Syringe,
  ThumbsUp,
  Timer,
  Truck,
  Users,
} from "lucide-react";
import { packageIncludes, reviews, slugify } from "@/data/site";
import { catalogueApi } from "@/lib/catalogue";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/packages/$slug")({
  loader: async ({ params }) => {
    const [pkg, packages] = await Promise.all([
      catalogueApi.getPackage(params.slug).catch(() => null),
      catalogueApi.listPackages(),
    ]);
    if (!pkg) throw notFound();
    return { pkg, packages };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Package not found — MD Path Lab" }, { name: "robots", content: "noindex" }],
      };
    }
    const p = loaderData.pkg;
    const title = `${p.name} — ₹${p.price} | MD Path Lab`;
    const description = `${p.subtitle}. ${p.parameters} parameters, ${p.reportsIn.toLowerCase()}, free home sample collection and a complimentary doctor consultation.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: PackageDetail,
});

const howItWorks = [
  { icon: CalendarCheck, title: "Book your slot", text: "Pick a 60-minute window, seven days a week." },
  { icon: Truck, title: "We come to you", text: "Certified phlebotomist arrives with a sealed kit." },
  { icon: Syringe, title: "Sample collection", text: "Barcoded vials, cold-chain transport to the lab." },
  { icon: FileCheck2, title: "Report & consult", text: "Pathologist-verified report plus a free doctor call." },
];

const trustItems = [
  { icon: Truck, label: "Free home sample collection", tint: "bg-primary-soft text-primary" },
  { icon: FileCheck2, label: "Free report counselling", tint: "bg-secondary-soft text-secondary" },
  { icon: ShieldCheck, label: "NABL & CAP certified labs", tint: "bg-success-soft text-success" },
  { icon: MapPin, label: "Available in 1,000+ cities", tint: "bg-warning/15 text-warning" },
];

function TestGroupRow({ group }: { group: { group: string; items: string[] } }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
            <BadgeCheck className="h-4.5 w-4.5" />
          </span>
          <div>
            <p className="text-sm font-bold">{group.group}</p>
            <p className="text-xs text-muted-foreground">{group.items.length} tests</p>
          </div>
        </div>
        <ChevronDown className={cn("h-4.5 w-4.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <ul className="grid gap-2 pb-4 pl-12 sm:grid-cols-2">
          {group.items.map((i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" /> {i}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function PackageDetail() {
  const { pkg, packages } = Route.useLoaderData();
  const groups = packageIncludes["default"] ?? [];
  const off = Math.round(100 - (pkg.price / pkg.mrp) * 100);
  const others = packages.filter((p) => p.name !== pkg.name);
  const shortName = pkg.name.replace(/^MD Path Lab\s*/i, "");
  const matchedReviews = reviews.filter((r) => r.package === shortName);
  const fillerReviews = reviews.filter((r) => r.package !== shortName);
  const displayReviews = [...matchedReviews, ...fillerReviews].slice(0, 3);

  const meta = [
    { icon: BadgeCheck, label: "Parameters", value: `${pkg.parameters} tests` },
    { icon: Timer, label: "Reports", value: pkg.reportsIn },
    { icon: Users, label: "Best for", value: pkg.bestFor },
    { icon: Clock3, label: "Fasting", value: "10-12 hours" },
  ];

  return (
    <>
      <h1 className="sr-only">{pkg.name}</h1>

      <section className="relative py-12 lg:py-16">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-gradient-to-b from-primary via-primary/70 to-transparent lg:h-[420px]" />

        <div className="container-page relative mb-6">
          <nav className="flex items-center gap-1.5 text-xs font-semibold text-primary-foreground/80">
            <Link to="/" className="hover:text-primary-foreground">
              Home
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link to="/packages" className="hover:text-primary-foreground">
              Packages
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-primary-foreground">{pkg.name}</span>
          </nav>
        </div>

        <div className="container-page relative flex flex-col gap-8 lg:flex-row lg:items-start">
          <div className="flex-1 space-y-6">
            <div className="surface-card p-7 shadow-[var(--shadow-lift)]">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <span className="rounded-full bg-secondary-soft px-3 py-1 text-[11px] font-bold text-secondary uppercase">
                    {pkg.badge}
                  </span>
                  <p className="mt-2.5 text-sm text-muted-foreground">{pkg.subtitle}</p>
                </div>
                <div className="shrink-0 rounded-2xl bg-primary-soft px-4 py-3 text-center">
                  <p className="text-3xl font-extrabold text-primary">{pkg.parameters}</p>
                  <p className="text-[10px] font-bold tracking-wide text-primary uppercase">Tests included</p>
                </div>
              </div>

              <div className="mt-6 border-t border-dashed border-border pt-5">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {meta.map((m) => (
                    <div key={m.label} className="flex items-center gap-2.5">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-primary">
                        <m.icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
                          {m.label}
                        </p>
                        <p className="truncate text-xs font-bold">{m.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 border-t border-dashed border-border pt-5">
                <h3 className="text-sm font-extrabold">About this package</h3>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {pkg.highlights.map((h: string) => (
                    <li key={h} className="flex gap-2 text-sm text-muted-foreground">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {h}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6 flex flex-wrap gap-3 border-t border-dashed border-border pt-6">
                <Link to="/book" search={{ item: slugify(pkg.name) }}>
                  <ActionButton variant="primary" size="lg">
                    Book Now <ArrowRight className="h-4 w-4" />
                  </ActionButton>
                </Link>
                <Link to="/contact">
                  <ActionButton variant="outline" size="lg">
                    Get a callback
                  </ActionButton>
                </Link>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {trustItems.map((t) => (
                <div key={t.label} className="surface-card flex items-center gap-3 p-4">
                  <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", t.tint)}>
                    <t.icon className="h-4.5 w-4.5" />
                  </span>
                  <p className="text-xs font-semibold">{t.label}</p>
                </div>
              ))}
            </div>

            <div className="surface-card p-7">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-extrabold">Tests included</h2>
                <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary">
                  {pkg.parameters} tests
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Tap a group to see every parameter covered in this package.
              </p>
              <div className="mt-5">
                {groups.map((g) => (
                  <TestGroupRow key={g.group} group={g} />
                ))}
              </div>
            </div>

            <div className="surface-card p-7">
              <h2 className="text-xl font-extrabold">How it works</h2>
              <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {howItWorks.map((s, i) => (
                  <div key={s.title} className="relative">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground">
                      <s.icon className="h-4.5 w-4.5" />
                    </span>
                    <p className="mt-3 text-sm font-bold">
                      {i + 1}. {s.title}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.text}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="surface-card p-7">
              <h2 className="text-xl font-extrabold">What customers say</h2>
              <div className="mt-5 grid gap-5 sm:grid-cols-3">
                {displayReviews.map((r) => (
                  <div key={r.name} className="rounded-xl border border-border p-5">
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={cn("h-3.5 w-3.5", i < r.rating ? "fill-warning text-warning" : "text-border")}
                        />
                      ))}
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-foreground/80">"{r.text}"</p>
                    <p className="mt-4 text-xs font-bold">
                      {r.name} <span className="font-normal text-muted-foreground">· {r.city}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="surface-card p-7">
              <h2 className="text-xl font-extrabold">Compare other packages</h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {others.map((o) => (
                  <Link
                    key={o.name}
                    to="/packages/$slug"
                    params={{ slug: slugify(o.name) }}
                    className="rounded-xl border border-border p-5 transition-colors hover:border-primary/30 hover:bg-primary-soft"
                  >
                    <p className="text-sm font-bold">{o.name}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{o.parameters} parameters</p>
                    <p className="mt-2 text-lg font-extrabold text-primary">₹{o.price}</p>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <aside className="w-full space-y-5 lg:sticky lg:top-36 lg:w-[380px] lg:shrink-0">
            <div className="rounded-[var(--radius-lg)] border border-warning/25 bg-warning/10 p-7 shadow-[var(--shadow-lift)]">
              <span className="rounded-full bg-warning/25 px-3 py-1 text-[11px] font-bold text-foreground uppercase">
                Exclusive offer
              </span>
              <div className="mt-4 flex items-end gap-3">
                <p className="text-3xl font-extrabold text-primary">₹{pkg.price}</p>
                <p className="pb-1 text-sm text-muted-foreground line-through">₹{pkg.mrp}</p>
                <span className="pb-1 text-xs font-bold text-success">{off}% off</span>
              </div>
              <p className="mt-2 text-xs font-semibold text-success">
                Free home collection + free doctor consultation
              </p>

              <Link to="/book" search={{ item: slugify(pkg.name) }} className="mt-5 block">
                <ActionButton variant="primary" size="lg" className="w-full">
                  Book now <ArrowRight className="h-4 w-4" />
                </ActionButton>
              </Link>

              <div className="mt-4 flex items-center gap-2 rounded-xl bg-card/70 px-4 py-2.5">
                <ThumbsUp className="h-4 w-4 shrink-0 text-warning" />
                <p className="text-xs font-semibold text-foreground/80">480+ people booked this month</p>
              </div>

              <div className="mt-3 flex items-center justify-center gap-2 border-t border-warning/20 pt-3">
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-warning text-warning" />
                  ))}
                </div>
                <p className="text-xs font-semibold text-muted-foreground">4.8/5 rating</p>
              </div>

              <Link to="/contact" className="mt-4 block">
                <ActionButton variant="outline" size="md" className="w-full">
                  Request a callback
                </ActionButton>
              </Link>
              <p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-primary" /> Reports verified by MD Pathologists
              </p>
            </div>

            <div className="rounded-[var(--radius-lg)] border border-success/20 bg-success-soft p-6">
              <p className="text-sm font-bold">Call or chat with a health expert</p>
              <p className="mt-1 text-xs text-muted-foreground">Need help? Talk to our health advisors.</p>
              <a href="tel:8400100800" className="mt-4 flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-card text-success">
                  <Phone className="h-4.5 w-4.5" />
                </span>
                <span className="text-sm font-bold">8400100800</span>
              </a>
              <Link to="/contact" className="mt-3 flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-card text-success">
                  <MessageCircle className="h-4.5 w-4.5" />
                </span>
                <span className="text-sm font-bold">Request a callback</span>
              </Link>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
