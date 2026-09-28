import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Clock, Scan, Search, Utensils } from "lucide-react";
import { catalogueApi } from "@/lib/catalogue";
import { useSelectedCity } from "@/lib/selectedCity";
import { PageHero } from "@/components/ui-kit/PageHero";
import { RevealGroup, RevealItem } from "@/components/ui-kit/Reveal";

const title = "Book X-Ray, Scans & MRI Online — MD Path Lab";
const description =
  "Browse X-Ray, CT scan, MRI and ultrasound services with transparent pricing. Book online, then visit a partner lab near you for the scan.";

export const Route = createFileRoute("/radiology/")({
  validateSearch: z.object({ search: z.string().optional() }),
  loader: async () => {
    const tests = await catalogueApi.listRadiology();
    return { tests };
  },
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
  component: RadiologyPage,
});

function RadiologyPage() {
  const { tests: loaderTests } = Route.useLoaderData();
  const { search: searchParam } = Route.useSearch();
  const [query, setQuery] = useState(searchParam ?? "");

  useEffect(() => {
    setQuery(searchParam ?? "");
  }, [searchParam]);

  // Same after-hydration city-price refetch pattern as /tests and /packages.
  const { city } = useSelectedCity();
  const [allTests, setAllTests] = useState(loaderTests);
  useEffect(() => {
    if (!city) return;
    let cancelled = false;
    catalogueApi
      .listRadiology(city.id)
      .then((rows) => {
        if (!cancelled) setAllTests(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [city]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allTests;
    return allTests.filter(
      (t) => t.name.toLowerCase().includes(q) || t.modality?.toLowerCase().includes(q) || t.category?.name.toLowerCase().includes(q),
    );
  }, [allTests, query]);

  return (
    <>
      <PageHero
        crumb="X-Ray, Scans & MRI"
        eyebrow="Radiology & imaging"
        title="Book X-Ray, CT, MRI & Ultrasound scans"
        description="Book online, then visit a nearby partner lab in person for the scan — imaging equipment can't come to you, so every radiology booking is matched to a lab near your address."
      />

      <section className="py-12 lg:py-16">
        <div className="container-page">
          <div className="surface-card flex items-center gap-3 p-3">
            <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl bg-muted px-4 py-3">
              <Search className="h-5 w-5 shrink-0 text-primary" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search radiology tests"
                placeholder="Search a scan, e.g. Chest X-Ray, MRI Knee…"
                className="w-full min-w-0 bg-transparent text-sm font-medium placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
          </div>

          <p className="mt-4 text-sm font-semibold text-muted-foreground">
            Showing {results.length} of {allTests.length} radiology tests
          </p>

          <RevealGroup className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {results.map((t) => (
              <RevealItem key={t.slug}>
                <Link
                  to="/radiology/$slug"
                  params={{ slug: t.slug }}
                  className="surface-card lift-on-hover group flex h-full flex-col p-6 hover:border-primary/25"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <Scan className="h-5 w-5" />
                    </span>
                    {t.modality ? (
                      <span className="rounded-full bg-secondary-soft px-2.5 py-1 text-[10px] font-bold tracking-wide text-secondary uppercase">
                        {t.modality}
                      </span>
                    ) : null}
                  </div>
                  <h2 className="mt-5 text-base leading-snug font-bold">{t.name}</h2>
                  <div className="mt-4 space-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
                    <p className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 shrink-0 text-primary" /> Reports {t.reportsIn}
                    </p>
                    <p className="flex items-center gap-2">
                      <Utensils className="h-3.5 w-3.5 shrink-0 text-primary" /> Fasting: {t.fasting}
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
              No radiology tests matched your search. Try a different keyword.
            </p>
          ) : null}
        </div>
      </section>
    </>
  );
}
