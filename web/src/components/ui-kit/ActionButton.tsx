import { cva, type VariantProps } from "class-variance-authority";
import { motion } from "motion/react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

const actionButton = cva(
  "inline-flex items-center justify-center gap-2 rounded-full font-bold whitespace-nowrap transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-60",
  {
    variants: {
      variant: {
        primary: "bg-secondary text-secondary-foreground shadow-[var(--shadow-cta)] hover:bg-secondary/90",
        navy: "bg-primary text-primary-foreground shadow-[var(--shadow-navy)] hover:bg-primary-deep",
        outline: "border border-primary/20 bg-card text-primary shadow-[var(--shadow-soft)] hover:bg-primary-soft",
        ghost: "text-primary hover:bg-primary-soft",
        light:
          "bg-primary-foreground text-primary shadow-[var(--shadow-soft)] hover:bg-primary-foreground/90",
      },
      size: {
        sm: "h-10 px-5 text-sm",
        md: "h-12 px-6 text-sm sm:text-base",
        lg: "h-14 px-8 text-base",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type Props = ComponentProps<typeof motion.button> &
  VariantProps<typeof actionButton> & { children: ReactNode };

export function ActionButton({ className, variant, size, children, ...props }: Props) {
  return (
    <motion.button
      type="button"
      whileHover={{ y: -2, scale: 1.015 }}
      whileTap={{ scale: 0.975 }}
      transition={{ type: "spring", stiffness: 400, damping: 24 }}
      className={cn(actionButton({ variant, size }), className)}
      {...props}
    >
      {children}
    </motion.button>
  );
}
