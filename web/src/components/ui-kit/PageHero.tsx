import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

export function PageHero({
  eyebrow,
  title,
  description,
  crumb,
}: {
  eyebrow: string;
  title: string;
  description: string;
  crumb: string;
}) {
  return (
    <section className="mesh-hero border-b border-border">
      <div className="container-page py-12 lg:py-16">
        <nav className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Link to="/" className="hover:text-primary">
            Home
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-primary">{crumb}</span>
        </nav>
        <p className="mt-6 inline-flex rounded-full bg-primary-soft px-3 py-1 text-[11px] font-bold tracking-wide text-primary uppercase">
          {eyebrow}
        </p>
        <h1 className="text-balance-tight mt-4 max-w-3xl text-3xl leading-[1.1] sm:text-4xl lg:text-5xl">
          {title}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {description}
        </p>
      </div>
    </section>
  );
}
