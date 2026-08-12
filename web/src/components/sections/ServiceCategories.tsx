import { motion } from "motion/react";
import {
  Dna,
  FileText,
  FlaskConical,
  HeartPulse,
  Scan,
  Stethoscope,
} from "lucide-react";

const categories = [
  { icon: FlaskConical, label: "Blood Tests", offer: "Up to 79% off", href: "#tests" },
  { icon: Scan, label: "X-Ray, Scans & MRI", offer: "Up to 70% off", href: "#tests" },
  { icon: Stethoscope, label: "Doctor & Diet Consult", offer: "Up to 75% off", href: "#doctors" },
  { icon: HeartPulse, label: "Full Body Checkup", offer: "Flat 65% off", href: "#packages" },
  { icon: Dna, label: "DNA & Genomics", offer: "Up to 70% off", href: "#tests" },
  { icon: FileText, label: "Upload Prescription", offer: "Free review", href: "#process" },
];

export function ServiceCategories() {
  return (
    <section className="bg-background pt-10 pb-4 lg:pt-14">
      <div className="container-page">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 lg:gap-4">
          {categories.map((c, i) => (
            <motion.a
              key={c.label}
              href={c.href}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: i * 0.05 }}
              className="group flex flex-col items-center text-center"
            >
              <span className="flex w-full flex-col items-center rounded-2xl bg-primary-soft px-3 pt-6 pb-3 transition-all group-hover:-translate-y-1 group-hover:shadow-[var(--shadow-card)]">
                <c.icon className="h-9 w-9 text-primary" />
                <span className="mt-5 w-full rounded-md bg-card/80 py-1 text-[11px] font-bold text-primary">
                  {c.offer}
                </span>
              </span>
              <span className="mt-2.5 text-sm leading-snug font-bold text-foreground/90">
                {c.label}
              </span>
            </motion.a>
          ))}
        </div>
      </div>
    </section>
  );
}
