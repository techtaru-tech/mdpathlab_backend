import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Droplet,
  Heart,
  Minus,
  Plus,
  Salad,
  ShieldPlus,
  Venus,
  Weight,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHero } from "@/components/ui-kit/PageHero";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { Reveal } from "@/components/ui-kit/Reveal";
import { getPackage, getTest, slugify } from "@/data/site";
import { cn } from "@/lib/utils";

const title = "Lifestyle Disorders — Diabetes, Thyroid, Heart & More | MD Path Lab";
const description =
  "Diabetes, thyroid, heart disease, PCOS and other lifestyle disorders are often silent for years. See the exact tests that catch each one early, with free home collection.";

export const Route = createFileRoute("/lifestyle-disorders")({
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
  component: LifestyleDisordersPage,
});

type Disorder = {
  id: string;
  icon: LucideIcon;
  tint: string;
  name: string;
  summary: string;
  symptoms: string[];
  tests: string[];
  packageName: string;
};

const disorders: Disorder[] = [
  {
    id: "diabetes",
    icon: Droplet,
    tint: "bg-primary-soft text-primary",
    name: "Diabetes (Type 2)",
    summary: "One of the most common lifestyle disorders in India, often silent until complications set in.",
    symptoms: ["Frequent urination", "Unusual thirst", "Persistent fatigue", "Slow-healing wounds"],
    tests: ["HbA1c (Glycated Haemoglobin)", "Fasting Blood Sugar (FBS)"],
    packageName: "MD Path Lab Advanced Full Body",
  },
  {
    id: "heart",
    icon: Heart,
    tint: "bg-secondary-soft text-secondary",
    name: "Heart Disease & Hypertension",
    summary: "Sedentary routines and high-stress schedules are raising cardiac risk earlier than ever before.",
    symptoms: ["Breathlessness on exertion", "Chest discomfort", "High BP readings", "Family history of heart disease"],
    tests: ["Lipid Profile", "CRP Quantitative"],
    packageName: "MD Path Lab Advanced Full Body",
  },
  {
    id: "thyroid",
    icon: Activity,
    tint: "bg-success-soft text-success",
    name: "Thyroid Disorders",
    summary: "An under- or overactive thyroid quietly affects weight, mood and energy for years before diagnosis.",
    symptoms: ["Unexplained weight change", "Hair fall", "Constant fatigue", "Mood swings"],
    tests: ["Thyroid Profile Total (T3, T4, TSH)"],
    packageName: "MD Path Lab Essential Health Checkup",
  },
  {
    id: "obesity",
    icon: Weight,
    tint: "bg-warning/15 text-warning",
    name: "Obesity & Metabolic Syndrome",
    summary: "Extra weight rarely travels alone — sugar, cholesterol and liver markers usually drift together.",
    symptoms: ["Waist circumference above normal", "High sugar & cholesterol together", "Constant fatigue", "Skin darkening around the neck"],
    tests: ["Lipid Profile", "Fasting Blood Sugar (FBS)", "Liver Function Test (LFT)"],
    packageName: "MD Path Lab Advanced Full Body",
  },
  {
    id: "pcos",
    icon: Venus,
    tint: "bg-secondary-soft text-secondary",
    name: "PCOS / PCOD",
    summary: "A hormonal imbalance affecting 1 in 5 Indian women, frequently missed until fertility is affected.",
    symptoms: ["Irregular periods", "Acne & excess hair growth", "Difficulty losing weight", "Fertility concerns"],
    tests: ["PCOS Hormone Panel", "Testosterone Total"],
    packageName: "MD Path Lab Women's Wellness",
  },
  {
    id: "liver",
    icon: Salad,
    tint: "bg-primary-soft text-primary",
    name: "Fatty Liver Disease",
    summary: "Linked closely to diet and alcohol use, fatty liver shows almost no symptoms in its early stages.",
    symptoms: ["Fatigue", "Discomfort in upper-right abdomen", "Unexplained weight gain", "Elevated liver enzymes"],
    tests: ["Liver Function Test (LFT)"],
    packageName: "MD Path Lab Advanced Full Body",
  },
  {
    id: "kidney",
    icon: ShieldPlus,
    tint: "bg-primary-soft text-primary",
    name: "Kidney Disorders",
    summary: "Uncontrolled blood pressure and diabetes are the leading causes of preventable kidney damage.",
    symptoms: ["Swelling in legs or ankles", "Change in urination pattern", "Persistent fatigue", "High blood pressure"],
    tests: ["Kidney Function Test (KFT)"],
    packageName: "MD Path Lab Senior Citizen Care",
  },
  {
    id: "fatigue",
    icon: Zap,
    tint: "bg-warning/15 text-warning",
    name: "Vitamin Deficiency & Chronic Fatigue",
    summary: "Desk-bound routines and low sun exposure make Vitamin D and B12 deficiency common across all ages.",
    symptoms: ["Constant tiredness", "Bone & joint pain", "Poor concentration", "Frequent infections"],
    tests: ["Vitamin D (25-OH)", "Vitamin B12 Serum"],
    packageName: "MD Path Lab Essential Health Checkup",
  },
];

function DisorderRow({ d, isOpen, onToggle }: { d: Disorder; isOpen: boolean; onToggle: () => void }) {
  const pkg = getPackage(slugify(d.packageName));

  return (
    <div className={cn("surface-card overflow-hidden", isOpen && "border-primary/25 shadow-[var(--shadow-card)]")}>
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 p-5 text-left sm:p-6"
      >
        <span className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-2xl", d.tint)}>
          <d.icon className="h-5.5 w-5.5" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-bold sm:text-base">{d.name}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground sm:text-sm">{d.summary}</span>
        </span>
        <span
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors",
            isOpen ? "bg-primary text-primary-foreground" : "bg-muted text-primary",
          )}
        >
          {isOpen ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="grid gap-6 border-t border-dashed border-border p-5 pt-5 sm:p-6 sm:pt-6 lg:grid-cols-2">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase">Watch for these signs</p>
                <ul className="mt-3 space-y-2">
                  {d.symptoms.map((s) => (
                    <li key={s} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase">Recommended tests</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {d.tests.map((tName) => {
                    const slug = slugify(tName);
                    const t = getTest(slug);
                    return (
                      <Link
                        key={tName}
                        to="/tests/$slug"
                        params={{ slug }}
                        className="flex items-center gap-2 rounded-full border border-border bg-muted px-3.5 py-2 text-xs font-semibold transition-colors hover:border-primary/30 hover:bg-primary-soft hover:text-primary"
                      >
                        {tName}
                        {t ? <span className="text-primary">₹{t.price}</span> : null}
                      </Link>
                    );
                  })}
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  {pkg ? (
                    <Link to="/packages/$slug" params={{ slug: slugify(pkg.name) }}>
                      <ActionButton variant="primary" size="sm">
                        View {pkg.name.replace(/^MD Path Lab\s*/i, "")} <ArrowRight className="h-3.5 w-3.5" />
                      </ActionButton>
                    </Link>
                  ) : null}
                  <Link to="/book" search={{ item: slugify(d.tests[0]!) }}>
                    <ActionButton variant="outline" size="sm">
                      Book {d.tests[0]}
                    </ActionButton>
                  </Link>
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function LifestyleDisordersPage() {
  const [open, setOpen] = useState<string | null>("diabetes");

  return (
    <>
      <PageHero
        crumb="Lifestyle Disorders"
        eyebrow="Preventive screening"
        title="Lifestyle disorders don't wait for symptoms. Neither should you."
        description="Diabetes, thyroid, heart disease and PCOS are increasingly common and often silent for years. Pick a concern below to see exactly which tests your doctor would order."
      />

      <section className="py-10 lg:py-16">
        <div className="container-page">
          <Reveal>
            <div className="space-y-4">
              {disorders.map((d) => (
                <DisorderRow
                  key={d.id}
                  d={d}
                  isOpen={open === d.id}
                  onToggle={() => setOpen(open === d.id ? null : d.id)}
                />
              ))}
            </div>
          </Reveal>

          <Reveal delay={0.05}>
            <div className="mt-12 flex flex-col items-center gap-5 rounded-[var(--radius-2xl)] border border-border bg-card p-10 text-center shadow-[var(--shadow-card)]">
              <h2 className="text-balance-tight max-w-xl text-2xl sm:text-3xl">
                Not sure which one applies to you?
              </h2>
              <p className="max-w-lg text-sm text-muted-foreground sm:text-base">
                Our Advanced Full Body package screens for all of the above in one visit, with a free doctor
                consultation to walk you through the results.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Link to="/packages/$slug" params={{ slug: slugify("MD Path Lab Advanced Full Body") }}>
                  <ActionButton variant="primary" size="lg">
                    View Advanced Full Body
                  </ActionButton>
                </Link>
                <Link to="/packages">
                  <ActionButton variant="outline" size="lg">
                    Compare all packages
                  </ActionButton>
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
