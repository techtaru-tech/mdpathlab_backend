import { motion } from "motion/react";
import { Link } from "@tanstack/react-router";
import {
  Dna,
  FileText,
  FlaskConical,
  HeartPulse,
  Scan,
} from "lucide-react";

// Hero listens for this and opens its "Upload your prescription" dialog (or sends a logged-out
// visitor to log in first), so this tile does exactly what the Hero's own button does.
export const OPEN_PRESCRIPTION_UPLOAD_EVENT = "open-prescription-upload";

type Tile = { icon: typeof Scan; label: string; offer: string } & (
  | { kind: "tests"; category?: string }
  | { kind: "packages" }
  | { kind: "radiology" }
  | { kind: "upload" }
);

const categories: Tile[] = [
  { icon: FlaskConical, label: "Blood Tests", offer: "Up to 79% off", kind: "tests" },
  { icon: Scan, label: "X-Ray, Scans & MRI", offer: "Up to 70% off", kind: "radiology" },
  { icon: HeartPulse, label: "Full Body Checkup", offer: "Flat 65% off", kind: "packages" },
  { icon: Dna, label: "DNA & Genomics", offer: "Up to 70% off", kind: "tests", category: "dna-test" },
  { icon: FileText, label: "Upload Prescription", offer: "Free review", kind: "upload" },
];

const tileClass = "group flex flex-col items-center text-center";

function TileBody({ c }: { c: Tile }) {
  return (
    <>
      <span className="flex w-full flex-col items-center rounded-2xl bg-primary-soft px-3 pt-6 pb-3 transition-all group-hover:-translate-y-1 group-hover:shadow-[var(--shadow-card)]">
        <c.icon className="h-9 w-9 text-primary" />
        <span className="mt-5 w-full rounded-md bg-card/80 py-1 text-[11px] font-bold text-primary">{c.offer}</span>
      </span>
      <span className="mt-2.5 text-sm leading-snug font-bold text-foreground/90">{c.label}</span>
    </>
  );
}

function TileLink({ c }: { c: Tile }) {
  if (c.kind === "upload") {
    return (
      <button
        type="button"
        onClick={() => {
          window.scrollTo({ top: 0, behavior: "smooth" });
          window.dispatchEvent(new Event(OPEN_PRESCRIPTION_UPLOAD_EVENT));
        }}
        className={tileClass}
      >
        <TileBody c={c} />
      </button>
    );
  }
  if (c.kind === "radiology") {
    return (
      <Link to="/radiology" className={tileClass}>
        <TileBody c={c} />
      </Link>
    );
  }
  if (c.kind === "packages") {
    return (
      <Link to="/packages" className={tileClass}>
        <TileBody c={c} />
      </Link>
    );
  }
  return (
    <Link to="/tests" search={c.category ? { category: c.category } : {}} className={tileClass}>
      <TileBody c={c} />
    </Link>
  );
}

export function ServiceCategories() {
  return (
    <section className="bg-background pt-10 pb-4 lg:pt-14">
      <div className="container-page">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4">
          {categories.map((c, i) => (
            <motion.div
              key={c.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: i * 0.05 }}
              className="flex"
            >
              <div className="flex w-full flex-col">
                <TileLink c={c} />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
