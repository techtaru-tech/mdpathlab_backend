import { BadgeCheck, FileBadge, Globe2, Lock, ScrollText, ShieldCheck } from "lucide-react";
import { SectionHeading } from "@/components/ui-kit/SectionHeading";
import { RevealGroup, RevealItem } from "@/components/ui-kit/Reveal";

const certs = [
  {
    icon: BadgeCheck,
    code: "NABL",
    title: "National Accreditation Board for Testing and Calibration Laboratories",
    detail: "Certificate MC-4128 · Medical testing scope, valid through Mar 2028",
  },
  {
    icon: ScrollText,
    code: "CAP",
    title: "College of American Pathologists",
    detail: "Gurugram reference laboratory · Bi-annual proficiency testing cleared",
  },
  {
    icon: Globe2,
    code: "ISO 15189:2022",
    title: "Quality and competence in medical laboratories",
    detail: "Applied across all 34 processing labs and 260 collection centres",
  },
  {
    icon: Lock,
    code: "ISO 27001",
    title: "Information security management",
    detail: "Encrypted report storage, OTP access control, DPDP Act aligned",
  },
];

export function Certifications() {
  return (
    <section className="py-10 lg:py-16">
      <div className="container-page">
        <div className="grid gap-14 lg:grid-cols-[0.85fr_1.15fr]">
          <SectionHeading
            eyebrow={
              <>
                <ShieldCheck className="h-3.5 w-3.5" /> Accreditations
              </>
            }
            title="Certifications you can actually verify"
            description="Every certificate number below is listed on the issuing body's public registry. We would rather you check than take our word for it."
          />

          <RevealGroup className="grid gap-5 sm:grid-cols-2">
            {certs.map((c) => (
              <RevealItem key={c.code} className="h-full">
                <div className="surface-card lift-on-hover flex h-full flex-col p-6 hover:border-primary/25">
                  <div className="flex items-center gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
                      <c.icon className="h-5 w-5" />
                    </span>
                    <span className="text-base font-extrabold tracking-tight text-primary">{c.code}</span>
                  </div>
                  <p className="mt-4 text-sm leading-snug font-bold">{c.title}</p>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{c.detail}</p>
                  <span className="mt-5 inline-flex w-fit items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-[11px] font-bold text-success">
                    <FileBadge className="h-3 w-3" /> Verified
                  </span>
                </div>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </div>
    </section>
  );
}
