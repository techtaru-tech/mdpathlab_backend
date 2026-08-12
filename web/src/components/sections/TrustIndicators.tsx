import { motion } from "motion/react";
import { Beaker, CreditCard, Landmark, Lock, ShieldCheck, Users } from "lucide-react";
import { Reveal } from "@/components/ui-kit/Reveal";

const stats = [
  { icon: Users, value: "1M+", label: "Customers served" },
  { icon: Beaker, value: "10M+", label: "Tests processed" },
  { icon: Landmark, value: "1000+", label: "Cities covered" },
  { icon: ShieldCheck, value: "4.9/5", label: "Rated by 2.4L users" },
];

const marquee = [
  "NABL Accredited",
  "CAP Accredited",
  "ISO 15189:2022",
  "ISO 27001 Data Security",
  "Certified Phlebotomists",
  "100% Secure Payments",
  "DPDP Act Compliant",
  "MD Pathologist Verified",
];

export function TrustIndicators() {
  return (
    <section className="py-10 lg:py-14">
      <div className="container-page">
        <Reveal>
          <div className="surface-card overflow-hidden shadow-[var(--shadow-card)]">
            <div className="grid divide-y divide-border sm:grid-cols-2 sm:divide-x lg:grid-cols-4 lg:divide-y-0">
              {stats.map((s, i) => (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.08 }}
                  className="flex items-center gap-4 p-8"
                >
                  <span className="grid h-13 w-13 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">
                    <s.icon className="h-6 w-6" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-2xl font-extrabold text-primary">{s.value}</p>
                    <p className="text-xs font-semibold text-muted-foreground">{s.label}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="no-scrollbar relative overflow-hidden border-t border-border bg-muted py-4">
              <div className="animate-marquee flex w-max gap-10 pr-10">
                {[...marquee, ...marquee].map((m, i) => (
                  <span
                    key={`${m}-${i}`}
                    className="flex items-center gap-2 text-xs font-bold tracking-wide text-muted-foreground uppercase"
                  >
                    {i % 3 === 0 ? (
                      <Lock className="h-3.5 w-3.5 text-primary" />
                    ) : i % 3 === 1 ? (
                      <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <CreditCard className="h-3.5 w-3.5 text-primary" />
                    )}
                    {m}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
