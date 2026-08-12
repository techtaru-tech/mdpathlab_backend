import { cn } from "@/lib/utils";
import { Reveal } from "./Reveal";
import type { ReactNode } from "react";

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary-soft px-4 py-1.5 text-xs font-bold tracking-[0.14em] text-primary uppercase",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  action,
  invert = false,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
  action?: ReactNode;
  invert?: boolean;
}) {
  return (
    <Reveal>
      <div
        className={cn(
          "flex flex-col gap-4",
          align === "center"
            ? "items-center text-center"
            : "lg:flex-row lg:items-end lg:justify-between",
        )}
      >
        <div className={cn("max-w-2xl", align === "center" && "flex flex-col items-center")}>
          <Eyebrow
            className={cn(
              invert && "border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground",
            )}
          >
            {eyebrow}
          </Eyebrow>
          <h2
            className={cn(
              "text-balance-tight mt-3 text-2xl leading-[1.15] sm:text-3xl lg:text-4xl",
              invert ? "text-primary-foreground" : "text-foreground",
            )}
          >
            {title}
          </h2>
          {description ? (
            <p
              className={cn(
                "mt-2.5 text-sm leading-relaxed sm:text-base",
                invert ? "text-primary-foreground/70" : "text-muted-foreground",
              )}
            >
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </Reveal>
  );
}
