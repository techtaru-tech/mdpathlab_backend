import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Building2,
  Check,
  GraduationCap,
  Handshake,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { cities } from "@/data/site";
import { PageHero } from "@/components/ui-kit/PageHero";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { cn } from "@/lib/utils";

const title = "Franchise & Partnership — MD Path Lab";
const description =
  "Partner with MD Path Lab. Low-investment diagnostic collection center and franchise lab models with training, marketing and NABL-backed processes included.";

export const Route = createFileRoute("/franchise")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FranchisePage,
});

const benefits = [
  { icon: Wallet, title: "Low investment", text: "Start a collection center with a fraction of a full lab's setup cost." },
  { icon: ShieldCheck, title: "NABL-backed processes", text: "Every sample is processed to the same accredited standard as our own labs." },
  { icon: GraduationCap, title: "Training & certification", text: "Phlebotomy and process training for your team before you go live." },
  { icon: TrendingUp, title: "Marketing support", text: "Local launch marketing and ongoing demand-generation from our app and website." },
  { icon: Users, title: "Dedicated area manager", text: "A single point of contact for operations, supply and escalations." },
  { icon: Handshake, title: "Transparent payouts", text: "Fixed commission structure with monthly settlement, no hidden deductions." },
];

const tiers = [
  {
    name: "Collection Center",
    investment: "₹3-5 lakh",
    area: "150-250 sq. ft.",
    roi: "12-18 months",
    highlights: ["Sample collection only", "No lab equipment needed", "Ideal for tier 2/3 cities"],
  },
  {
    name: "Franchise Lab",
    investment: "₹12-18 lakh",
    area: "600-900 sq. ft.",
    roi: "18-24 months",
    highlights: ["In-house basic testing", "Collection + processing", "Higher margin per test"],
    featured: true,
  },
  {
    name: "Mega Lab",
    investment: "₹35 lakh+",
    area: "1500+ sq. ft.",
    roi: "24-30 months",
    highlights: ["Full diagnostic capability", "Regional hub for smaller centers", "Highest margin tier"],
  },
];

function FranchisePage() {
  const [sent, setSent] = useState(false);

  return (
    <>
      <PageHero
        crumb="Franchise"
        eyebrow="Partner with us"
        title="Bring NABL-accredited diagnostics to your city"
        description="Join 1,000+ cities already served by MD Path Lab. Choose a partnership model that fits your investment and space."
      />

      <section className="py-12 lg:py-16">
        <div className="container-page">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-extrabold sm:text-3xl">Why partner with MD Path Lab</h2>
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">
              We handle the accreditation, training and demand. You bring the local presence.
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {benefits.map((b) => (
              <div key={b.title} className="surface-card p-6">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary-soft text-primary">
                  <b.icon className="h-5 w-5" />
                </span>
                <p className="mt-4 text-sm font-bold">{b.title}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{b.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-surface py-12 lg:py-16">
        <div className="container-page">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-extrabold sm:text-3xl">Choose your partnership model</h2>
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">
              Illustrative ranges — our area manager will share exact numbers for your city.
            </p>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {tiers.map((t) => (
              <div
                key={t.name}
                className={cn(
                  "relative flex flex-col rounded-[var(--radius-lg)] p-7",
                  t.featured
                    ? "bg-primary text-primary-foreground shadow-[var(--shadow-lift)]"
                    : "surface-card",
                )}
              >
                {t.featured ? (
                  <span className="absolute -top-3 left-7 rounded-full bg-secondary px-3 py-1 text-[10px] font-bold tracking-wide text-secondary-foreground uppercase">
                    Most chosen
                  </span>
                ) : null}
                <span className="flex items-center gap-2.5">
                  <Building2 className="h-5 w-5" />
                  <span className="text-lg font-extrabold">{t.name}</span>
                </span>

                <div className="mt-5 flex items-end gap-2">
                  <span className="text-2xl font-extrabold">{t.investment}</span>
                  <span
                    className={cn(
                      "pb-1 text-xs",
                      t.featured ? "text-primary-foreground/70" : "text-muted-foreground",
                    )}
                  >
                    investment
                  </span>
                </div>

                <div
                  className={cn(
                    "mt-4 grid grid-cols-2 gap-3 rounded-xl p-3 text-xs font-semibold",
                    t.featured ? "bg-primary-foreground/10" : "bg-muted",
                  )}
                >
                  <span>Area: {t.area}</span>
                  <span>ROI: {t.roi}</span>
                </div>

                <ul className="mt-5 space-y-2.5">
                  {t.highlights.map((h) => (
                    <li key={h} className="flex items-start gap-2.5 text-sm">
                      <span
                        className={cn(
                          "mt-0.5 grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full",
                          t.featured
                            ? "bg-primary-foreground/15 text-primary-foreground"
                            : "bg-success-soft text-success",
                        )}
                      >
                        <Check className="h-3 w-3" />
                      </span>
                      <span className={t.featured ? "text-primary-foreground/85" : "text-foreground/80"}>
                        {h}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-12 lg:py-16">
        <div className="container-page">
          <div className="mx-auto max-w-xl">
            {sent ? (
              <div className="surface-card p-10 text-center">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-success-soft text-success">
                  <Check className="h-7 w-7" />
                </span>
                <h2 className="mt-5 text-2xl font-extrabold">Enquiry received</h2>
                <p className="mt-3 text-sm text-muted-foreground">
                  Our partnerships team will call you within 2 working days to discuss the right model
                  for your city.
                </p>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setSent(true);
                }}
                className="surface-card space-y-4 p-7"
              >
                <h2 className="text-lg font-extrabold">Request a franchise callback</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <input
                    required
                    aria-label="Full name"
                    placeholder="Full name"
                    className="h-12 rounded-xl border border-border bg-muted px-4 text-sm font-medium focus:outline-none"
                  />
                  <input
                    required
                    inputMode="tel"
                    aria-label="Mobile number"
                    placeholder="Mobile number"
                    className="h-12 rounded-xl border border-border bg-muted px-4 text-sm font-medium focus:outline-none"
                  />
                  <input
                    aria-label="Email"
                    type="email"
                    placeholder="Email (optional)"
                    className="h-12 rounded-xl border border-border bg-muted px-4 text-sm font-medium focus:outline-none"
                  />
                  <select
                    required
                    defaultValue=""
                    aria-label="City"
                    className="h-12 rounded-xl border border-border bg-muted px-4 text-sm font-semibold focus:outline-none"
                  >
                    <option value="" disabled>
                      Select your city
                    </option>
                    {cities.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <select
                  required
                  defaultValue=""
                  aria-label="Investment capacity"
                  className="h-12 w-full rounded-xl border border-border bg-muted px-4 text-sm font-semibold focus:outline-none"
                >
                  <option value="" disabled>
                    Investment capacity
                  </option>
                  <option>₹3-5 lakh (Collection Center)</option>
                  <option>₹12-18 lakh (Franchise Lab)</option>
                  <option>₹35 lakh+ (Mega Lab)</option>
                  <option>Not sure yet</option>
                </select>
                <textarea
                  aria-label="Message"
                  rows={4}
                  placeholder="Tell us about your space and timeline (optional)…"
                  className="w-full rounded-xl border border-border bg-muted p-4 text-sm font-medium focus:outline-none"
                />
                <ActionButton variant="primary" size="lg" className="w-full" type="submit">
                  Request callback
                </ActionButton>
              </form>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
