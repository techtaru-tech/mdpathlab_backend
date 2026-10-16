import { BadgeCheck, Clock3, HeartHandshake, Home, Phone } from "lucide-react";
import { SectionHeading } from "@/components/ui-kit/SectionHeading";
import { Reveal, RevealGroup, RevealItem } from "@/components/ui-kit/Reveal";
import { useSiteSettings } from "@/lib/site-settings";

// The four reasons from MD Path Labs' own website (mdpathlabs.com, "Why Choose Md Path Labs ?") — kept to the
// claims the lab itself makes.
const reasons = [
  {
    icon: Home,
    highlight: "Free",
    title: "Home Sample Collection",
    text: "A trained phlebotomist comes to your home at the slot you pick — no need to travel to the lab.",
  },
  {
    icon: BadgeCheck,
    highlight: "ISO",
    title: "Certified Pathology",
    text: "Our pathology lab is ISO certified, so every sample goes through a documented, quality-checked process.",
  },
  {
    icon: HeartHandshake,
    highlight: "80,000+",
    title: "Satisfied Patients",
    text: "Families have trusted MD Path Labs with their tests and reports for years — and keep coming back.",
  },
  {
    icon: Clock3,
    highlight: "24 Hr.",
    title: "Order Service",
    text: "Book a test any time of day, online or over the phone — we confirm your booking and schedule the pickup.",
  },
];

export function WhyChooseMdPathLabs() {
  const settings = useSiteSettings();
  const phone = settings?.phone;

  return (
    <section className="bg-surface py-10 lg:py-16">
      <div className="container-page">
        <SectionHeading
          eyebrow={
            <>
              <BadgeCheck className="h-3.5 w-3.5" /> Why choose us
            </>
          }
          title="Why choose MD Path Labs?"
          description="Accurate tests, collected at your home, from a lab you can trust."
        />

        <RevealGroup className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {reasons.map((r) => (
            <RevealItem key={r.title} className="h-full">
              <div className="surface-card lift-on-hover relative flex h-full flex-col overflow-hidden p-6 hover:border-primary/25">
                <span aria-hidden className="absolute -top-10 -right-10 h-28 w-28 rounded-full bg-primary-soft" />
                <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-[var(--shadow-card)]">
                  <r.icon className="h-6 w-6" />
                </span>
                <p className="relative mt-5 text-3xl font-extrabold tracking-tight text-primary">{r.highlight}</p>
                <h3 className="relative mt-1 text-base font-bold">{r.title}</h3>
                <p className="relative mt-2 text-sm leading-relaxed text-muted-foreground">{r.text}</p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>

        {phone ? (
          <Reveal delay={0.1}>
            <div className="mt-8 flex flex-col items-start justify-between gap-4 rounded-[var(--radius-lg)] border border-primary/12 bg-primary-soft p-6 sm:flex-row sm:items-center">
              <div>
                <p className="text-base font-extrabold text-primary">Want to book over the phone?</p>
                <p className="mt-1 text-sm text-muted-foreground">Call us and we'll book your test and schedule a home collection.</p>
              </div>
              <a
                href={`tel:${phone.replace(/\s+/g, "")}`}
                className="inline-flex shrink-0 items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary-deep"
              >
                <Phone className="h-4 w-4" /> {phone}
              </a>
            </div>
          </Reveal>
        ) : null}
      </div>
    </section>
  );
}
