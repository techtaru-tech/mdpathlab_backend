import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { BadgeCheck, Check, Clock, FlaskConical, ShieldCheck, ShoppingCart, Utensils } from "lucide-react";
import { slugify } from "@/data/site";
import { catalogueApi } from "@/lib/catalogue";
import { useAddToCart } from "@/lib/useAddToCart";
import { PageHero } from "@/components/ui-kit/PageHero";
import { ActionButton } from "@/components/ui-kit/ActionButton";

export const Route = createFileRoute("/tests/$slug")({
  loader: async ({ params }) => {
    const [test, allTests] = await Promise.all([
      catalogueApi.getTest(params.slug).catch(() => null),
      catalogueApi.listTests(),
    ]);
    if (!test) throw notFound();
    return { test, allTests };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Test not found — MD Path Lab" }, { name: "robots", content: "noindex" }] };
    }
    const t = loaderData.test;
    const title = `${t.name} Test — ₹${t.price} | MD Path Lab`;
    const description = `Book ${t.name} at ₹${t.price} with free home sample collection. ${t.parameters} parameters, reports ${t.reportsIn.toLowerCase()}, fasting: ${t.fasting.toLowerCase()}.`;
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
  component: TestDetail,
});

function TestDetail() {
  const { test, allTests } = Route.useLoaderData();
  const related = allTests.filter((t) => t.name !== test.name).slice(0, 4);
  const off = Math.round(100 - (test.price / test.mrp) * 100);
  const { addToCart, adding, added, error: cartError } = useAddToCart(slugify(test.name));

  return (
    <>
      <PageHero
        crumb={test.name}
        eyebrow="Lab test"
        title={test.name}
        description={`A NABL-accredited ${test.name} covering ${test.parameters} ${test.parameters === 1 ? "parameter" : "parameters"}, collected free at your home and verified by an MD Pathologist.`}
      />

      <section className="py-12 lg:py-16">
        <div className="container-page grid gap-8 lg:grid-cols-[1.4fr_0.6fr]">
          <div className="space-y-6">
            <div className="surface-card p-7">
              <h2 className="text-xl font-extrabold">Test overview</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                {[
                  { icon: FlaskConical, label: "Parameters", value: `${test.parameters} included` },
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
                The {test.name} is one of our most frequently booked investigations. Samples are
                barcoded at collection, transported in temperature-controlled boxes and processed on
                fully automated Roche and Siemens analysers. You receive a digital report on
                WhatsApp, email and in the MD Path Lab app with reference ranges and trend charts.
              </p>
            </div>

            <div className="surface-card p-7">
              <h2 className="text-xl font-extrabold">Preparation & sample</h2>
              <ul className="mt-5 space-y-3 text-sm text-muted-foreground">
                {[
                  `Fasting requirement: ${test.fasting}.`,
                  "Sample type: blood drawn from the arm using a sealed single-use kit.",
                  "Collection slots available from 6:00 AM to 8:00 PM, 7 days a week.",
                  "Inform the phlebotomist about ongoing medication or supplements.",
                ].map((line) => (
                  <li key={line} className="flex gap-3">
                    <BadgeCheck className="h-4.5 w-4.5 shrink-0 text-success" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>

            <div className="surface-card p-7">
              <h2 className="text-xl font-extrabold">Frequently booked with</h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {related.map((r) => (
                  <Link
                    key={r.name}
                    to="/tests/$slug"
                    params={{ slug: slugify(r.name) }}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border p-4 transition-colors hover:border-primary/30 hover:bg-primary-soft"
                  >
                    <span className="text-sm font-bold">{r.name}</span>
                    <span className="text-sm font-extrabold text-primary">₹{r.price}</span>
                  </Link>
                ))}
              </div>
            </div>
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
              <p className="mt-2 text-xs font-semibold text-success">
                Free home collection included
              </p>
              <Link to="/book" search={{ item: slugify(test.name) }} className="mt-6 block">
                <ActionButton variant="primary" size="lg" className="w-full">
                  Book this test
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
                <ShieldCheck className="h-4 w-4 text-primary" /> NABL & CAP accredited laboratory
              </p>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
