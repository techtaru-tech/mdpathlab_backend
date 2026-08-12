import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Sparkles, Timer, Users } from "lucide-react";
import { slugify } from "@/data/site";
import { catalogueApi } from "@/lib/catalogue";
import { PageHero } from "@/components/ui-kit/PageHero";
import { RevealGroup, RevealItem } from "@/components/ui-kit/Reveal";
import { cn } from "@/lib/utils";

const title = "Full Body Health Checkup Packages — MD Path Lab";
const description =
  "Compare full body checkup packages from ₹899 with up to 94 parameters, free home collection, same-day reports and a complimentary doctor consultation.";

export const Route = createFileRoute("/packages/")({
  loader: () => catalogueApi.listPackages(),
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
  component: PackagesPage,
});

const tabs = ["All packages", "Under ₹1500", "60+ parameters"];

function PackagesPage() {
  const packages = Route.useLoaderData();
  const [tab, setTab] = useState(tabs[0]);
  const list = packages.filter((p) =>
    tab === "Under ₹1500" ? p.price < 1500 : tab === "60+ parameters" ? p.parameters >= 60 : true,
  );

  return (
    <>
      <PageHero
        crumb="Full body checkup"
        eyebrow="Health packages"
        title="Full body health checkups designed by our pathologists"
        description="Every package is built around a life stage, reviewed quarterly by our medical board and includes a free tele-consultation to walk you through your results."
      />

      <section className="py-12 lg:py-16">
        <div className="container-page">
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "shrink-0 rounded-full px-5 py-2.5 text-sm font-bold transition-colors",
                  tab === t
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground/70 hover:text-primary",
                )}
              >
                {t}
              </button>
            ))}
          </div>

          <RevealGroup className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {list.map((p) => (
              <RevealItem key={p.name} className="h-full">
                <Link
                  to="/packages/$slug"
                  params={{ slug: slugify(p.name) }}
                  className={cn(
                    "lift-on-hover relative flex h-full flex-col overflow-hidden rounded-[var(--radius-lg)] p-7",
                    p.featured
                      ? "bg-primary text-primary-foreground shadow-[var(--shadow-lift)]"
                      : "surface-card hover:border-primary/25",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold tracking-wide uppercase",
                        p.featured
                          ? "bg-secondary text-secondary-foreground"
                          : "bg-primary-soft text-primary",
                      )}
                    >
                      {p.featured ? <Sparkles className="h-3 w-3" /> : null}
                      {p.badge}
                    </span>
                    <span
                      className={cn(
                        "text-xs font-bold",
                        p.featured ? "text-primary-foreground/70" : "text-muted-foreground",
                      )}
                    >
                      {Math.round(100 - (p.price / p.mrp) * 100)}% off
                    </span>
                  </div>

                  <h2 className="mt-5 text-lg leading-snug font-extrabold">{p.name}</h2>
                  <p
                    className={cn(
                      "mt-2 text-sm",
                      p.featured ? "text-primary-foreground/70" : "text-muted-foreground",
                    )}
                  >
                    {p.subtitle}
                  </p>

                  <div
                    className={cn(
                      "mt-5 grid grid-cols-2 gap-3 rounded-2xl p-3 text-xs font-semibold",
                      p.featured ? "bg-primary-foreground/10" : "bg-muted",
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 shrink-0" /> {p.bestFor}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Timer className="h-3.5 w-3.5 shrink-0" /> {p.reportsIn}
                    </span>
                  </div>

                  <ul className="mt-5 space-y-2.5 text-sm">
                    {p.highlights.map((h) => (
                      <li key={h} className="flex gap-2.5">
                        <Check
                          className={cn(
                            "h-4 w-4 shrink-0",
                            p.featured ? "text-secondary" : "text-success",
                          )}
                        />
                        <span className={p.featured ? "" : "text-muted-foreground"}>{h}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-auto flex items-end justify-between gap-3 pt-7">
                    <div>
                      <p className="text-2xl font-extrabold">₹{p.price}</p>
                      <p
                        className={cn(
                          "text-xs line-through",
                          p.featured ? "text-primary-foreground/60" : "text-muted-foreground",
                        )}
                      >
                        ₹{p.mrp} · {p.parameters} tests
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-4 py-2 text-xs font-bold",
                        p.featured
                          ? "bg-secondary text-secondary-foreground"
                          : "bg-primary text-primary-foreground",
                      )}
                    >
                      View details
                    </span>
                  </div>
                </Link>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </section>
    </>
  );
}
