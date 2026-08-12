import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  BookOpen,
  Clock,
  Droplets,
  HeartPulse,
  Salad,
  Sparkles,
  Syringe,
  Thermometer,
} from "lucide-react";
import { PageHero } from "@/components/ui-kit/PageHero";
import { RevealGroup, RevealItem } from "@/components/ui-kit/Reveal";

const title = "Health Blog — MD Path Lab";
const description =
  "Simple, doctor-reviewed explainers on lab tests, preventive health and how to read your reports — from the MD Path Lab medical team.";

export const Route = createFileRoute("/blog")({
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
  component: BlogPage,
});

const posts = [
  {
    icon: Activity,
    category: "Preventive Care",
    title: "Why you shouldn't skip your annual full body checkup",
    excerpt:
      "Most lifestyle diseases show no symptoms until they're advanced. Here's what an annual screening actually catches early.",
    readTime: "5 min read",
    date: "28 Jul 2026",
  },
  {
    icon: Droplets,
    category: "Thyroid",
    title: "Understanding your thyroid report: TSH, T3 and T4 explained",
    excerpt:
      "A simple, jargon-free breakdown of what each thyroid marker means and when your doctor might ask for more tests.",
    readTime: "6 min read",
    date: "21 Jul 2026",
  },
  {
    icon: Sparkles,
    category: "Nutrition",
    title: "5 early signs of Vitamin D deficiency you shouldn't ignore",
    excerpt:
      "Fatigue and joint pain are more common than you'd think in India. Here's when it's worth getting tested.",
    readTime: "4 min read",
    date: "14 Jul 2026",
  },
  {
    icon: HeartPulse,
    category: "Diabetes",
    title: "HbA1c vs fasting blood sugar: which test should you choose?",
    excerpt:
      "Both track blood sugar, but they answer different questions. Here's how to know which one your doctor needs.",
    readTime: "5 min read",
    date: "05 Jul 2026",
  },
  {
    icon: Syringe,
    category: "Test Prep",
    title: "How to prepare for a fasting blood test",
    excerpt:
      "What counts as fasting, whether you can drink water, and what happens if you accidentally eat before your slot.",
    readTime: "3 min read",
    date: "28 Jun 2026",
  },
  {
    icon: Thermometer,
    category: "Heart Health",
    title: "Heart health after 40: the tests that matter most",
    excerpt:
      "Lipid profile is just the start. Here's what a cardiologist actually looks at during a preventive heart screening.",
    readTime: "6 min read",
    date: "19 Jun 2026",
  },
  {
    icon: Salad,
    category: "Lifestyle",
    title: "Reading your lipid profile without a medical degree",
    excerpt:
      "LDL, HDL, triglycerides — what the numbers mean, what's actually risky, and what a good ratio looks like.",
    readTime: "5 min read",
    date: "10 Jun 2026",
  },
];

function BlogPage() {
  return (
    <>
      <PageHero
        crumb="Blog"
        eyebrow="Health, explained simply"
        title="The MD Path Lab health blog"
        description="Doctor-reviewed explainers on lab tests, reports and preventive health — written in plain language, not medical jargon."
      />

      <section className="py-12 lg:py-16">
        <div className="container-page">
          <RevealGroup className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((p) => (
              <RevealItem key={p.title} className="h-full">
                <article className="surface-card lift-on-hover flex h-full flex-col p-6">
                  <div className="flex items-center justify-between gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                      <p.icon className="h-5 w-5" />
                    </span>
                    <span className="rounded-full bg-secondary-soft px-2.5 py-1 text-[10px] font-bold tracking-wide text-secondary uppercase">
                      {p.category}
                    </span>
                  </div>
                  <h2 className="mt-5 text-base leading-snug font-bold">{p.title}</h2>
                  <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{p.excerpt}</p>
                  <div className="mt-auto flex items-center gap-4 border-t border-border pt-5 text-xs font-semibold text-muted-foreground">
                    <span>{p.date}</span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" /> {p.readTime}
                    </span>
                  </div>
                </article>
              </RevealItem>
            ))}
          </RevealGroup>

          <div className="surface-card mt-10 flex flex-col items-center gap-3 p-8 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-primary">
              <BookOpen className="h-5.5 w-5.5" />
            </span>
            <p className="text-lg font-extrabold">More articles coming soon</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Our medical board publishes a new explainer every week. Check back soon, or follow us on
              social media for updates.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
