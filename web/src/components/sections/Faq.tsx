import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { HelpCircle, Minus, Plus, PhoneCall } from "lucide-react";
import { faqs } from "@/data/site";
import { SectionHeading } from "@/components/ui-kit/SectionHeading";
import { Reveal } from "@/components/ui-kit/Reveal";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { cn } from "@/lib/utils";

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="py-10 lg:py-16">
      <div className="container-page">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <SectionHeading
              eyebrow={
                <>
                  <HelpCircle className="h-3.5 w-3.5" /> Frequently asked
                </>
              }
              title="Everything you wanted to ask before booking"
              description="Still unsure? Our care team answers in under 2 minutes, 24 hours a day."
            />
            <Reveal delay={0.1}>
              <div className="surface-card mt-8 flex items-center gap-4 p-6">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
                  <PhoneCall className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold">Talk to a health advisor</p>
                  <p className="text-xs text-muted-foreground">8400100800 · Free, 24x7</p>
                </div>
              </div>
            </Reveal>
          </div>

          <Reveal>
            <div className="space-y-4">
              {faqs.map((f, i) => {
                const isOpen = open === i;
                return (
                  <div
                    key={f.q}
                    className={cn(
                      "surface-card overflow-hidden",
                      isOpen && "border-primary/25 shadow-[var(--shadow-card)]",
                    )}
                  >
                    <button
                      onClick={() => setOpen(isOpen ? null : i)}
                      aria-expanded={isOpen}
                      className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 p-6 text-left"
                    >
                      <span className="min-w-0 text-sm font-bold sm:text-base">{f.q}</span>
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
                          <p className="px-6 pb-6 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.05}>
          <div className="mt-16 flex flex-col items-center gap-5 rounded-[var(--radius-2xl)] border border-border bg-card p-10 text-center shadow-[var(--shadow-card)]">
            <h3 className="text-balance-tight max-w-xl text-2xl sm:text-3xl">
              Your next health checkup is 90 seconds away
            </h3>
            <p className="max-w-lg text-sm text-muted-foreground sm:text-base">
              Free home collection, same-day reports and a doctor to explain them. No card required to book.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <ActionButton variant="primary" size="lg">
                Book a Test
              </ActionButton>
              <ActionButton variant="outline" size="lg">
                Compare packages
              </ActionButton>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
