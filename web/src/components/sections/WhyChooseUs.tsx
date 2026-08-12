import { motion } from "motion/react";
import { Award, HeartPulse, Microscope, Smartphone, Stethoscope, Wallet } from "lucide-react";
import labInterior from "@/assets/lab-interior.jpg";
import { SectionHeading } from "@/components/ui-kit/SectionHeading";
import { Reveal, RevealGroup, RevealItem } from "@/components/ui-kit/Reveal";

const reasons = [
  {
    icon: Microscope,
    title: "Fully automated processing",
    text: "Roche and Siemens analysers with barcode-tracked samples remove manual handling errors end to end.",
  },
  {
    icon: Stethoscope,
    title: "Doctor-verified every time",
    text: "No report leaves our lab without sign-off from an MD Pathologist — not an automated printout.",
  },
  {
    icon: Wallet,
    title: "Honest, upfront pricing",
    text: "The price you see is the price you pay. No collection fee, no surge pricing, no bundled add-ons.",
  },
  {
    icon: Smartphone,
    title: "Everything in one app",
    text: "Slot booking, live phlebotomist tracking, reports and year-on-year trend charts for your whole family.",
  },
];

export function WhyChooseUs() {
  return (
    <section className="relative overflow-hidden py-10 lg:py-16">
      <div className="container-page">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <Reveal>
            <div className="relative">
              <div className="overflow-hidden rounded-[2rem] border border-border shadow-[var(--shadow-lift)]">
                <img
                  src={labInterior}
                  alt="Interior of a NABL accredited MD Path Lab processing laboratory"
                  width={1280}
                  height={800}
                  loading="lazy"
                  className="h-[24rem] w-full object-cover lg:h-[30rem]"
                />
              </div>
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="glass-panel absolute -bottom-8 left-4 rounded-2xl p-5 sm:left-8"
              >
                <div className="flex items-center gap-4">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">
                    <Award className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="text-2xl font-extrabold text-primary">99.9%</p>
                    <p className="text-xs font-semibold text-muted-foreground">
                      Report accuracy across 10M+ samples
                    </p>
                  </div>
                </div>
              </motion.div>
            </div>
          </Reveal>

          <div>
            <SectionHeading
              eyebrow={
                <>
                  <HeartPulse className="h-3.5 w-3.5" /> Why 1 million families choose us
                </>
              }
              title="Built like a hospital lab. Priced for every home."
              description="We own our laboratories instead of outsourcing samples — which is why we can guarantee the turnaround time, the accuracy and the price."
            />

            <RevealGroup className="mt-10 grid gap-5 sm:grid-cols-2">
              {reasons.map((r) => (
                <RevealItem key={r.title}>
                  <div className="surface-card lift-on-hover h-full p-6 hover:border-primary/25">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-secondary-soft text-secondary">
                      <r.icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-4 text-base font-bold">{r.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{r.text}</p>
                  </div>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </div>
      </div>
    </section>
  );
}
