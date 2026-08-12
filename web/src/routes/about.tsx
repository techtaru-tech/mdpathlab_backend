import { createFileRoute } from "@tanstack/react-router";
import { Award, Building2, HeartPulse, Microscope, Users } from "lucide-react";
import { PageHero } from "@/components/ui-kit/PageHero";
import { Certifications } from "@/components/sections/Certifications";
import { TrustIndicators } from "@/components/sections/TrustIndicators";

const title = "About MD Path Lab — Our Labs, Our Promise";
const description =
  "MD Path Lab runs its own NABL and CAP accredited laboratories across 1,000+ Indian cities, serving 1M+ customers with doctor-verified diagnostic reports.";

export const Route = createFileRoute("/about")({
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
  component: AboutPage,
});

const pillars = [
  { icon: Microscope, title: "We own our labs", text: "No outsourcing of samples means we control turnaround, accuracy and price end to end." },
  { icon: Users, title: "1M+ families served", text: "From first-time testers to chronic care patients tracking markers every quarter." },
  { icon: Award, title: "Accredited everywhere", text: "NABL ISO 15189:2022 across all labs, CAP at our Gurugram reference laboratory." },
  { icon: HeartPulse, title: "Care beyond the report", text: "Free tele-consultation with an MD on every package, plus trend charts in the app." },
];

function AboutPage() {
  return (
    <>
      <PageHero
        crumb="About us"
        eyebrow="Our story"
        title="Diagnostics built like a hospital lab, priced for every home"
        description="MD Path Lab started in 2013 with one processing laboratory in Gurugram. Today we run a national network of owned labs and collection teams across 1,000+ cities."
      />

      <section className="py-14 lg:py-20">
        <div className="container-page grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map((p) => (
            <div key={p.title} className="surface-card lift-on-hover p-7">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary-soft text-primary">
                <p.icon className="h-6 w-6" />
              </span>
              <h2 className="mt-5 text-base font-bold">{p.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-surface py-14 lg:py-20">
        <div className="container-page grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-extrabold">Our medical governance</h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Every MD Path Lab report is signed by an MD Pathologist. Our medical board reviews test
              panels quarterly, audits internal quality control twice daily and participates in
              external quality assurance programmes for every analyte we report.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
              {[
                "Twice-daily internal QC on every analyser",
                "Barcode tracked samples from doorstep to report",
                "Temperature-controlled sample logistics",
                "DPDP Act and ISO 27001 aligned data handling",
              ].map((l) => (
                <li key={l} className="flex gap-3">
                  <Building2 className="h-4.5 w-4.5 shrink-0 text-primary" /> {l}
                </li>
              ))}
            </ul>
          </div>
          <div className="surface-card p-8">
            <h3 className="text-lg font-extrabold">MD Path Lab in numbers</h3>
            <div className="mt-6 grid grid-cols-2 gap-6">
              {[
                ["2013", "Founded in Gurugram"],
                ["42", "Owned laboratories"],
                ["6,800+", "Certified phlebotomists"],
                ["99.9%", "Report accuracy"],
              ].map(([v, l]) => (
                <div key={l}>
                  <p className="text-2xl font-extrabold text-primary">{v}</p>
                  <p className="text-xs font-semibold text-muted-foreground">{l}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <TrustIndicators />
      <Certifications />
    </>
  );
}
