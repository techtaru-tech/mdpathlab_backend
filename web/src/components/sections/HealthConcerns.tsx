import { Heart } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { SectionHeading } from "@/components/ui-kit/SectionHeading";
import { RevealGroup, RevealItem } from "@/components/ui-kit/Reveal";
import { useCategories } from "@/lib/categories";
import { iconForCategory, sortCategoriesFeaturedFirst } from "@/lib/categoryIcons";

// Rotates through the same three accent tones the original mock data used, purely for visual
// variety across the grid — no meaning attached to which category gets which tone.
const HUES = [
  "bg-primary-soft text-primary group-hover:bg-primary group-hover:text-primary-foreground",
  "bg-secondary-soft text-secondary group-hover:bg-secondary group-hover:text-secondary-foreground",
  "bg-success-soft text-success group-hover:bg-success group-hover:text-primary-foreground",
];

export function HealthConcerns() {
  const categories = useCategories();
  const ordered = categories ? sortCategoriesFeaturedFirst(categories) : [];

  if (categories !== null && ordered.length === 0) return null;

  return (
    <section id="concerns" className="scroll-mt-16 bg-surface py-10 lg:py-16 lg:scroll-mt-32">
      <div className="container-page">
        <SectionHeading
          eyebrow={
            <>
              <Heart className="h-3.5 w-3.5" /> Shop by health concern
            </>
          }
          title="Not sure what to book? Start with a symptom."
          description="Pick what's worrying you and we'll show the exact panels your physician would order — nothing more, nothing less."
          align="center"
        />

        <RevealGroup className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {ordered.map((c, i) => {
            const Icon = iconForCategory(c.slug);
            return (
              <RevealItem key={c.id}>
                <Link
                  to="/tests"
                  search={{ category: c.slug }}
                  className="surface-card lift-on-hover group flex w-full items-center gap-4 p-5 text-left hover:border-primary/25"
                >
                  <span
                    className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl transition-colors duration-300 ${HUES[i % HUES.length]}`}
                  >
                    <Icon className="h-5.5 w-5.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{c.name}</span>
                    <span className="block text-xs font-semibold text-muted-foreground">
                      {c.testCount} test{c.testCount === 1 ? "" : "s"} &amp; panels
                    </span>
                  </span>
                </Link>
              </RevealItem>
            );
          })}
        </RevealGroup>
      </div>
    </section>
  );
}
