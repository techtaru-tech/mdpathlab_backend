import { motion, type Variants } from "motion/react";
import { Children, type ReactNode } from "react";

const variants: Variants = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0 },
};

export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

// A fixed 0.09s-per-child stagger looks great for the handful of items a homepage section shows
// (e.g. 4-8 cards finish cascading in well under a second), but the same fixed delay applied to a
// dynamic catalogue grid (tests/packages/blog, which can run into the dozens) stretches the full
// reveal out to several seconds — items far down the list sit at opacity:0 long after the page has
// otherwise finished loading, which reads as "the cards aren't showing" rather than "still
// animating in". Capping the group's total cascade time and deriving the per-child stagger from
// the actual child count keeps the same polish for small lists while making large ones settle
// in well under a second, same as a fresh page load already feels.
const MAX_GROUP_STAGGER_SECONDS = 0.6;

export function RevealGroup({
  children,
  className,
  stagger,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
}) {
  const count = Children.count(children);
  const effectiveStagger = stagger ?? (count > 1 ? Math.min(0.09, MAX_GROUP_STAGGER_SECONDS / count) : 0.09);
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.15 }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: effectiveStagger } } }}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={variants}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
