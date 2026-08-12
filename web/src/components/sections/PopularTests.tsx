import { Link } from "@tanstack/react-router";
import { ArrowRight, Clock, Droplets, FlaskConical, Utensils } from "lucide-react";
import { popularTests, slugify } from "@/data/site";
import { SectionHeading } from "@/components/ui-kit/SectionHeading";
import { RevealGroup, RevealItem } from "@/components/ui-kit/Reveal";
import { ActionButton } from "@/components/ui-kit/ActionButton";

export function PopularTests() {
  return (
    <section id="tests" className="scroll-mt-16 py-10 lg:py-16 lg:scroll-mt-32">
      <div className="container-page">
        <SectionHeading
          eyebrow={
            <>
              <FlaskConical className="h-3.5 w-3.5" /> Book individual tests
            </>
          }
          title="Popular lab tests booked every day"
          description="Transparent pricing, no hidden collection charges and NABL-stamped reports on every single test."
          action={
            <ActionButton variant="outline" size="md">
              View all 4,500+ tests <ArrowRight className="h-4 w-4" />
            </ActionButton>
          }
        />

        <RevealGroup className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {popularTests.map((t) => (
            <RevealItem key={t.name}>
              <article className="surface-card lift-on-hover group relative flex h-full flex-col p-6 hover:border-primary/25">
                <Link
                  to="/tests/$slug"
                  params={{ slug: slugify(t.name) }}
                  className="absolute inset-0 z-0"
                  aria-label={`View details for ${t.name}`}
                  tabIndex={-1}
                />

                <div className="pointer-events-none flex items-start justify-between gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <Droplets className="h-5 w-5" />
                  </span>
                  {t.tag ? (
                    <span className="rounded-full bg-secondary-soft px-2.5 py-1 text-[10px] font-bold tracking-wide text-secondary uppercase">
                      {t.tag}
                    </span>
                  ) : null}
                </div>

                <h3 className="pointer-events-none mt-5 text-base leading-snug font-bold">{t.name}</h3>
                <p className="pointer-events-none mt-2 text-xs font-semibold text-muted-foreground">
                  Includes {t.parameters} {t.parameters === 1 ? "parameter" : "parameters"}
                </p>

                <div className="pointer-events-none mt-4 space-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
                  <p className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 shrink-0 text-primary" /> Reports {t.reportsIn}
                  </p>
                  <p className="flex items-center gap-2">
                    <Utensils className="h-3.5 w-3.5 shrink-0 text-primary" /> Fasting: {t.fasting}
                  </p>
                </div>

                <div className="pointer-events-none mt-auto flex items-end justify-between gap-3 pt-6">
                  <div>
                    <p className="text-xl font-extrabold text-primary">₹{t.price}</p>
                    <p className="text-xs text-muted-foreground line-through">₹{t.mrp}</p>
                  </div>
                  <Link
                    to="/book"
                    search={{ item: slugify(t.name) }}
                    className="pointer-events-auto relative z-10"
                  >
                    <ActionButton variant="navy" size="sm">
                      Add
                    </ActionButton>
                  </Link>
                </div>
              </article>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
