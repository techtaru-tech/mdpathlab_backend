import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Clock, Droplets, Search, Utensils } from "lucide-react";
import { slugify } from "@/data/site";
import { catalogueApi } from "@/lib/catalogue";
import { PageHero } from "@/components/ui-kit/PageHero";
import { RevealGroup, RevealItem } from "@/components/ui-kit/Reveal";

const title = "Book Lab Tests Online — MD Path Lab";
const description =
  "Browse 4,500+ pathology and radiology tests with transparent pricing, free home sample collection and NABL-accredited same-day reports.";

export const Route = createFileRoute("/tests/")({
  loader: () => catalogueApi.listTests(),
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
  component: TestsPage,
});

const filters = ["All tests", "Same day", "No fasting", "Under ₹500"];

function TestsPage() {
  const allTests = Route.useLoaderData();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState(filters[0]);

  const results = useMemo(
    () =>
      allTests.filter((t) => {
        const matchQuery = t.name.toLowerCase().includes(query.trim().toLowerCase());
        const matchFilter =
          filter === "Same day"
            ? t.reportsIn === "Same day"
            : filter === "No fasting"
              ? t.fasting === "Not required"
              : filter === "Under ₹500"
                ? t.price < 500
                : true;
        return matchQuery && matchFilter;
      }),
    [allTests, query, filter],
  );

  return (
    <>
      <PageHero
        crumb="Lab tests"
        eyebrow="Pathology & radiology"
        title="Book any lab test with free home sample collection"
        description="Every test is processed in our own NABL-accredited laboratories and verified by an MD Pathologist before the report reaches you."
      />

      <section className="py-12 lg:py-16">
        <div className="container-page">
          <div className="surface-card flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl bg-muted px-4 py-3">
              <Search className="h-5 w-5 shrink-0 text-primary" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search tests"
                placeholder="Search a test, e.g. Thyroid, Vitamin D…"
                className="w-full min-w-0 bg-transparent text-sm font-medium placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
            <div className="no-scrollbar flex gap-2 overflow-x-auto">
              {filters.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={
                    "shrink-0 rounded-full px-4 py-2 text-xs font-bold transition-colors " +
                    (filter === f
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground/70 hover:text-primary")
                  }
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <p className="mt-6 text-sm font-semibold text-muted-foreground">
            Showing {results.length} of {allTests.length} tests
          </p>

          <RevealGroup className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {results.map((t) => (
              <RevealItem key={t.name}>
                <Link
                  to="/tests/$slug"
                  params={{ slug: slugify(t.name) }}
                  className="surface-card lift-on-hover group flex h-full flex-col p-6 hover:border-primary/25"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <Droplets className="h-5 w-5" />
                    </span>
                    {t.tag ? (
                      <span className="rounded-full bg-secondary-soft px-2.5 py-1 text-[10px] font-bold tracking-wide text-secondary uppercase">
                        {t.tag}
                      </span>
                    ) : null}
                  </div>
                  <h2 className="mt-5 text-base leading-snug font-bold">{t.name}</h2>
                  <p className="mt-2 text-xs font-semibold text-muted-foreground">
                    {t.parameters} {t.parameters === 1 ? "parameter" : "parameters"}
                  </p>
                  <div className="mt-4 space-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
                    <p className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 shrink-0 text-primary" /> Reports {t.reportsIn}
                    </p>
                    <p className="flex items-center gap-2">
                      <Utensils className="h-3.5 w-3.5 shrink-0 text-primary" /> Fasting:{" "}
                      {t.fasting}
                    </p>
                  </div>
                  <div className="mt-auto flex items-end justify-between gap-3 pt-6">
                    <div>
                      <p className="text-xl font-extrabold text-primary">₹{t.price}</p>
                      <p className="text-xs text-muted-foreground line-through">₹{t.mrp}</p>
                    </div>
                    <span className="rounded-full bg-secondary px-4 py-2 text-xs font-bold text-secondary-foreground">
                      Book now
                    </span>
                  </div>
                </Link>
              </RevealItem>
            ))}
          </RevealGroup>

          {results.length === 0 ? (
            <p className="mt-10 text-center text-sm text-muted-foreground">
              No tests matched your search. Try a different keyword.
            </p>
          ) : null}
        </div>
      </section>
    </>
  );
}
