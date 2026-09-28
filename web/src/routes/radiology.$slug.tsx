import { useEffect, useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { BadgeCheck, Check, Clock, MapPin, Scan, ShieldCheck, ShoppingCart, Utensils } from "lucide-react";
import { catalogueApi } from "@/lib/catalogue";
import { useSelectedCity } from "@/lib/selectedCity";
import { useAddToCart } from "@/lib/useAddToCart";
import { PageHero } from "@/components/ui-kit/PageHero";
import { ActionButton } from "@/components/ui-kit/ActionButton";

export const Route = createFileRoute("/radiology/$slug")({
  loader: async ({ params }) => {
    const [test, allTests] = await Promise.all([
      catalogueApi.getRadiology(params.slug).catch(() => null),
      catalogueApi.listRadiology(),
    ]);
    if (!test) throw notFound();
    return { test, allTests };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Radiology test not found — MD Path Lab" }, { name: "robots", content: "noindex" }] };
    }
    const t = loaderData.test;
    const title = `${t.name} — ₹${t.price} | MD Path Lab`;
    const description = `Book ${t.name} at ₹${t.price}. Reports ${t.reportsIn.toLowerCase()}, fasting: ${t.fasting.toLowerCase()}. Visit a nearby partner lab for the scan.`;
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
  component: RadiologyDetail,
});

function RadiologyDetail() {
  const { test: loaderTest, allTests } = Route.useLoaderData();
  const related = allTests.filter((t) => t.slug !== loaderTest.slug).slice(0, 4);

  const { city } = useSelectedCity();
  const [test, setTest] = useState(loaderTest);
  useEffect(() => {
    if (!city) return;
    let cancelled = false;
    catalogueApi
      .getRadiology(loaderTest.slug, city.id)
      .then((row) => {
        if (!cancelled) setTest(row);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [city, loaderTest.slug]);

  const off = Math.round(100 - (test.price / test.mrp) * 100);
  const { addToCart, adding, added, error: cartError } = useAddToCart(test.slug);

  return (
    <>
      <PageHero
        crumb={test.name}
        eyebrow={test.modality ?? "Radiology"}
        title={test.name}
        description="Book online, then visit a partner lab matched to your address in person — imaging equipment stays at the lab, so this is never a home collection."
      />

      <section className="py-12 lg:py-16">
        <div className="container-page grid gap-8 lg:grid-cols-[1.4fr_0.6fr]">
          <div className="space-y-6">
            <div className="surface-card p-7">
              <h2 className="text-xl font-extrabold">Test overview</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                {[
                  { icon: Scan, label: "Modality", value: test.modality ?? "Imaging" },
                  { icon: Clock, label: "Reports", value: test.reportsIn },
                  { icon: Utensils, label: "Fasting", value: test.fasting },
                ].map((m) => (
                  <div key={m.label} className="rounded-xl bg-muted p-4">
                    <m.icon className="h-5 w-5 text-primary" />
                    <p className="mt-3 text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                      {m.label}
                    </p>
                    <p className="text-sm font-bold">{m.value}</p>
                  </div>
                ))}
              </div>
              <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
                The {test.name} is performed by a qualified radiographer and reviewed by a radiologist. Book your
                preferred date and time online — at checkout we match you to a partner lab that offers this scan near
                your address, and you visit them in person for the imaging.
              </p>
            </div>

            <div className="surface-card p-7">
              <h2 className="text-xl font-extrabold">Preparation & visit</h2>
              <ul className="mt-5 space-y-3 text-sm text-muted-foreground">
                {[
                  `Fasting requirement: ${test.fasting}.`,
                  ...(test.preparationInstructions ? [test.preparationInstructions] : []),
                  "Carry a valid ID and any previous scan reports or doctor's referral, if you have one.",
                  "Arrive 10–15 minutes before your slot for registration at the lab.",
                ].map((line) => (
                  <li key={line} className="flex gap-3">
                    <BadgeCheck className="h-4.5 w-4.5 shrink-0 text-success" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>

            {related.length > 0 ? (
              <div className="surface-card p-7">
                <h2 className="text-xl font-extrabold">Frequently booked with</h2>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {related.map((r) => (
                    <Link
                      key={r.slug}
                      to="/radiology/$slug"
                      params={{ slug: r.slug }}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border p-4 transition-colors hover:border-primary/30 hover:bg-primary-soft"
                    >
                      <span className="text-sm font-bold">{r.name}</span>
                      <span className="text-sm font-extrabold text-primary">₹{r.price}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <aside className="lg:sticky lg:top-36 lg:self-start">
            <div className="surface-card p-7 shadow-[var(--shadow-card)]">
              <span className="rounded-full bg-secondary-soft px-3 py-1 text-[11px] font-bold text-secondary uppercase">
                {off}% off today
              </span>
              <div className="mt-4 flex items-end gap-3">
                <p className="text-3xl font-extrabold text-primary">₹{test.price}</p>
                <p className="pb-1 text-sm text-muted-foreground line-through">₹{test.mrp}</p>
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-primary">
                <MapPin className="h-3.5 w-3.5" /> Visit a lab near you — not home collection
              </p>
              <Link to="/book" search={{ item: test.slug }} className="mt-6 block">
                <ActionButton variant="primary" size="lg" className="w-full">
                  Book this scan
                </ActionButton>
              </Link>
              <ActionButton
                type="button"
                variant="outline"
                size="lg"
                className="mt-3 w-full"
                onClick={addToCart}
                disabled={adding}
              >
                {added ? (
                  <>
                    <Check className="h-4 w-4" /> Added to cart
                  </>
                ) : (
                  <>
                    <ShoppingCart className="h-4 w-4" /> {adding ? "Adding…" : "Add to Cart"}
                  </>
                )}
              </ActionButton>
              {cartError ? <p className="mt-2 text-xs font-semibold text-destructive">{cartError}</p> : null}
              <Link to="/contact" className="mt-3 block">
                <ActionButton variant="outline" size="lg" className="w-full">
                  Talk to an advisor
                </ActionButton>
              </Link>
              <p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-primary" /> NABL & CAP accredited partner labs
              </p>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
