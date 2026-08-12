import { CalendarCheck, FileCheck2, Route, Syringe, Truck } from "lucide-react";
import { SectionHeading } from "@/components/ui-kit/SectionHeading";
import { RevealGroup, RevealItem } from "@/components/ui-kit/Reveal";

const steps = [
  {
    icon: CalendarCheck,
    title: "Choose your slot",
    text: "Pick a test or package and a 60-minute window between 6:00 AM and 8:00 PM, seven days a week.",
    meta: "Takes 90 seconds",
  },
  {
    icon: Truck,
    title: "We come to you",
    text: "A certified phlebotomist arrives with a sealed kit. Track their live location right from the app.",
    meta: "Free above ₹399",
  },
  {
    icon: Syringe,
    title: "Painless collection",
    text: "Barcoded vials, cold-chain transport and lab entry within 4 hours of leaving your home.",
    meta: "Avg. 7 minutes",
  },
  {
    icon: FileCheck2,
    title: "Reports & guidance",
    text: "Pathologist-verified reports on WhatsApp plus a free doctor call to explain what they mean.",
    meta: "Same day",
  },
];

export function HowItWorks() {
  return (
    <section id="process" className="scroll-mt-16 relative overflow-hidden bg-primary py-10 lg:py-16 lg:scroll-mt-32">
      <div className="grid-lines pointer-events-none absolute inset-0 opacity-[0.15]" />
      <div className="pointer-events-none absolute -top-32 -right-24 h-96 w-96 rounded-full bg-secondary/20 blur-3xl" />
      <div className="container-page relative">
        <SectionHeading
          invert
          eyebrow={
            <>
              <Route className="h-3.5 w-3.5" /> How it works
            </>
          }
          title="Four steps from booking to a doctor-explained report"
          description="No queues, no paperwork, no follow-up calls. The entire journey is tracked and time-stamped."
          align="center"
        />

        <RevealGroup className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <RevealItem key={s.title} className="h-full">
              <div className="group relative flex h-full flex-col rounded-[var(--radius-lg)] border border-primary-foreground/12 bg-primary-foreground/[0.06] p-7 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-primary-foreground/25 hover:bg-primary-foreground/[0.11]">
                <span className="absolute top-6 right-6 text-4xl font-extrabold text-primary-foreground/12">
                  0{i + 1}
                </span>
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground shadow-[var(--shadow-cta)]">
                  <s.icon className="h-5.5 w-5.5" />
                </span>
                <h3 className="mt-5 text-lg font-bold text-primary-foreground">{s.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-primary-foreground/70">{s.text}</p>
                <p className="mt-5 inline-flex w-fit rounded-full bg-primary-foreground/10 px-3 py-1 text-[11px] font-bold tracking-wide text-primary-foreground/85 uppercase">
                  {s.meta}
                </p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
