import {
  Activity,
  Bone,
  Brain,
  Droplet,
  Heart,
  ShieldPlus,
  Thermometer,
  Venus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SectionHeading } from "@/components/ui-kit/SectionHeading";
import { RevealGroup, RevealItem } from "@/components/ui-kit/Reveal";
import { healthConcerns } from "@/data/site";
import { cn } from "@/lib/utils";

const icons: Record<string, LucideIcon> = {
  Diabetes: Droplet,
  "Heart Health": Heart,
  Thyroid: Activity,
  Kidney: ShieldPlus,
  Liver: Brain,
  "Bone & Joint": Bone,
  "Fever & Infection": Thermometer,
  "Women's Health": Venus,
};

const hues: Record<string, string> = {
  primary: "bg-primary-soft text-primary group-hover:bg-primary group-hover:text-primary-foreground",
  secondary:
    "bg-secondary-soft text-secondary group-hover:bg-secondary group-hover:text-secondary-foreground",
  accent: "bg-success-soft text-success group-hover:bg-success group-hover:text-primary-foreground",
};

export function HealthConcerns() {
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
          {healthConcerns.map((c) => {
            const Icon = icons[c.name] ?? Activity;
            return (
              <RevealItem key={c.name}>
                <button className="surface-card lift-on-hover group flex w-full items-center gap-4 p-5 text-left hover:border-primary/25">
                  <span
                    className={cn(
                      "grid h-12 w-12 shrink-0 place-items-center rounded-2xl transition-colors duration-300",
                      hues[c.hue],
                    )}
                  >
                    <Icon className="h-5.5 w-5.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{c.name}</span>
                    <span className="block text-xs font-semibold text-muted-foreground">
                      {c.tests} tests &amp; panels
                    </span>
                  </span>
                </button>
              </RevealItem>
            );
          })}
        </RevealGroup>
      </div>
    </section>
  );
}
