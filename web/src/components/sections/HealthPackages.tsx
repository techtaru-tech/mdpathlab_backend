import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { PackageCheck, Sparkles } from "lucide-react";
import { packages, slugify, type Pkg } from "@/data/site";
import { SectionHeading } from "@/components/ui-kit/SectionHeading";
import { RevealGroup, RevealItem } from "@/components/ui-kit/Reveal";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { cn } from "@/lib/utils";

function PackageCard({ p }: { p: Pkg }) {
  const [expanded, setExpanded] = useState(false);
  const discount = Math.round(100 - (p.price / p.mrp) * 100);
  const reportsInShort = p.reportsIn.replace(/^Within\s+/i, "");

  return (
    <article
      className={cn(
        "surface-card lift-on-hover relative flex h-full flex-col overflow-hidden rounded-[var(--radius-lg)]",
        p.featured && "ring-2 ring-primary/70",
      )}
    >
      <Link
        to="/packages/$slug"
        params={{ slug: slugify(p.name) }}
        className="absolute inset-0 z-0"
        aria-label={`View details for ${p.name}`}
        tabIndex={-1}
      />

      <div className="pointer-events-none flex items-start justify-between gap-3 p-4 pb-3">
        <div className="min-w-0">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide uppercase",
              p.featured ? "bg-secondary text-secondary-foreground" : "bg-primary-soft text-primary",
            )}
          >
            {p.featured ? <Sparkles className="h-3 w-3" /> : null}
            {p.badge}
          </span>
          <h3 className="mt-1.5 text-base leading-snug font-extrabold text-balance">{p.name}</h3>
        </div>
        <div className="shrink-0 rounded-xl bg-primary-soft px-3 py-1.5 text-center">
          <p className="text-xl font-extrabold text-primary">{p.parameters}</p>
          <p className="text-[10px] font-bold tracking-wide text-primary uppercase">Tests</p>
        </div>
      </div>

      <div className="pointer-events-none border-t border-dashed border-border" />

      <div className="pointer-events-none flex-1 p-4">
        <p className={cn("text-xs leading-relaxed", !expanded && "line-clamp-2")}>
          <span className="font-bold">Tests included: </span>
          <span className="text-muted-foreground">{p.highlights.join(", ")}</span>
        </p>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="pointer-events-auto relative z-10 mt-2 text-xs font-bold text-primary hover:underline"
        >
          {expanded ? "− Show less" : "+ Know more"}
        </button>
      </div>

      <div className="pointer-events-none grid grid-cols-3 gap-2 border-t border-border px-4 py-3 text-center">
        <div>
          <p className="text-xs font-bold">{p.bestFor}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">Best for</p>
        </div>
        <div>
          <p className="text-xs font-bold">{reportsInShort}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">Reports in</p>
        </div>
        <div>
          <p className="text-xs font-bold">Free</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">Home pickup</p>
        </div>
      </div>

      <div className="pointer-events-none mt-auto bg-primary-soft p-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-xl font-extrabold text-primary">₹{p.price}</span>
          <span className="text-xs text-muted-foreground line-through">₹{p.mrp}</span>
          <span className="text-xs font-bold text-primary">{discount}% off</span>
        </div>
        <Link
          to="/book"
          search={{ item: slugify(p.name) }}
          className="pointer-events-auto relative z-10 mt-2.5 block"
        >
          <ActionButton variant="primary" size="sm" className="w-full">
            Book Now
          </ActionButton>
        </Link>
      </div>
    </article>
  );
}

export function HealthPackages() {
  return (
    <section id="packages" className="scroll-mt-16 bg-surface py-10 lg:py-16 lg:scroll-mt-32">
      <div className="container-page">
        <SectionHeading
          eyebrow={
            <>
              <PackageCheck className="h-3.5 w-3.5" /> Full body health packages
            </>
          }
          title="Curated packages designed by our pathologists"
          description="Each package is built around a life stage, reviewed quarterly by our medical board and includes a free tele-consultation to walk you through your results."
          align="center"
        />

        <RevealGroup className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {packages.map((p) => (
            <RevealItem key={p.name} className="h-full">
              <PackageCard p={p} />
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
