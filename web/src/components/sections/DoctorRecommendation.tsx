import { Quote, Stethoscope } from "lucide-react";
import { SectionHeading } from "@/components/ui-kit/SectionHeading";
import { Reveal, RevealGroup, RevealItem } from "@/components/ui-kit/Reveal";
import { ActionButton } from "@/components/ui-kit/ActionButton";

const doctors = [
  {
    name: "Dr. Arjun Menon",
    specialty: "MD, Internal Medicine · Chennai",
    initials: "AM",
    quote:
      "I ask my patients to use MD Path Lab because the reference ranges are age and gender adjusted, and the reports arrive in a format I can actually read quickly during consultation.",
  },
  {
    name: "Dr. Sneha Kulkarni",
    specialty: "DM, Endocrinology · Pune",
    initials: "SK",
    quote:
      "For diabetes follow-ups, consistency of the lab matters more than the price. MD Path Lab's HbA1c values have stayed reproducible across every quarterly cycle I have tracked.",
  },
  {
    name: "Dr. Vikram Sethi",
    specialty: "MD, Cardiology · New Delhi",
    initials: "VS",
    quote:
      "Their lipid and cardiac risk panel covers ApoB and Lp(a), which most home-collection labs skip. That makes preventive counselling far more meaningful.",
  },
];

export function DoctorRecommendation() {
  return (
    <section className="bg-surface py-10 lg:py-16">
      <div className="container-page">
        <SectionHeading
          eyebrow={
            <>
              <Stethoscope className="h-3.5 w-3.5" /> Recommended by clinicians
            </>
          }
          title="12,000+ doctors refer their patients to MD Path Lab"
          description="We publish our internal quality control data every quarter, which is why physicians across India trust our numbers."
          action={
            <ActionButton variant="outline" size="md">
              Partner as a doctor
            </ActionButton>
          }
        />

        <RevealGroup className="mt-12 grid gap-6 lg:grid-cols-3">
          {doctors.map((d) => (
            <RevealItem key={d.name} className="h-full">
              <article className="surface-card lift-on-hover relative flex h-full flex-col p-7 hover:border-primary/25">
                <Quote className="absolute top-6 right-6 h-8 w-8 text-primary/10" />
                <p className="text-sm leading-relaxed text-foreground/85">“{d.quote}”</p>
                <div className="mt-auto flex items-center gap-4 border-t border-border pt-6">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-sm font-bold text-primary-foreground">
                    {d.initials}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{d.name}</p>
                    <p className="truncate text-xs font-semibold text-muted-foreground">{d.specialty}</p>
                  </div>
                </div>
              </article>
            </RevealItem>
          ))}
        </RevealGroup>

        <Reveal delay={0.1}>
          <div className="mt-8 grid gap-4 rounded-[var(--radius-lg)] border border-primary/12 bg-primary-soft p-7 sm:grid-cols-3">
            {[
              { k: "Free tele-consultation", v: "Included with every health package" },
              { k: "Second-opinion network", v: "450+ empanelled specialists" },
              { k: "Report interpretation", v: "Plain-language summary in every report" },
            ].map((item) => (
              <div key={item.k}>
                <p className="text-sm font-bold text-primary">{item.k}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.v}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
