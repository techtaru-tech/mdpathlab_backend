import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { ArrowRight, Download, FileText, FileUp, Home, Search, Star, UploadCloud } from "lucide-react";
import heroPathologist from "@/assets/hero-pathologist.jpg";
import heroEssential from "@/assets/hero-essential.jpg";
import heroAdvanced from "@/assets/hero-advanced.jpg";
import heroWomens from "@/assets/hero-womens.jpg";
import heroSenior from "@/assets/hero-senior.jpg";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { packages, slugify } from "@/data/site";
import { cn } from "@/lib/utils";

const quickSearches = ["Full Body Checkup", "Thyroid", "Vitamin D", "CBC", "HbA1c"];

const packageImages: Record<string, string> = {
  "md-path-lab-essential-health-checkup": heroEssential,
  "md-path-lab-advanced-full-body": heroAdvanced,
  "md-path-lab-women-s-wellness": heroWomens,
  "md-path-lab-senior-citizen-care": heroSenior,
};

type Slide = {
  id: string;
  kind: "brand" | "package";
  eyebrow: string;
  title: string;
  accent?: string;
  description: string;
  tests?: number;
  price?: number;
  mrp?: number;
  slug?: string;
  image: string;
  alt: string;
};

const brandSlide: Slide = {
  id: "brand",
  kind: "brand",
  eyebrow: "NABL + CAP accredited",
  title: "Lab-grade diagnostics,",
  accent: "delivered to your doorstep",
  description:
    "Book 4,500+ tests and full body health packages with free home sample collection, same-day reports and a complimentary doctor consultation.",
  image: heroPathologist,
  alt: "MD Path Lab pathologist standing in a NABL accredited diagnostic laboratory",
};

const packageSlides: Slide[] = packages.map((p) => {
  const slug = slugify(p.name);
  return {
    id: slug,
    kind: "package",
    eyebrow: p.badge ?? "Package",
    title: p.name.replace(/^MD Path Lab\s*/i, ""),
    description: p.subtitle,
    tests: p.parameters,
    price: p.price,
    mrp: p.mrp,
    slug,
    image: packageImages[slug]!,
    alt: `${p.name} — home sample collection`,
  };
});

const slides: Slide[] = [brandSlide, ...packageSlides];

function SlidePanel({ slide }: { slide: Slide }) {
  const discount =
    slide.price && slide.mrp ? Math.round(100 - (slide.price / slide.mrp) * 100) : null;

  return (
    <div className="relative flex h-[565px] items-center overflow-hidden bg-primary-deep sm:h-[445px] lg:h-[425px]">
      <img
        src={slide.image}
        alt={slide.alt}
        style={{
          maskImage: "linear-gradient(to right, transparent, black 35%)",
          WebkitMaskImage: "linear-gradient(to right, transparent, black 35%)",
        }}
        className="absolute inset-y-0 right-0 h-full w-full object-cover object-[80%_center] opacity-95 sm:w-2/3"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-primary-deep via-primary-deep/70 to-transparent sm:via-primary-deep/35" />

      <div className="relative z-10 max-w-xl px-6 pb-[205px] sm:px-10 sm:pb-[170px] lg:px-14 lg:pb-[155px]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3 py-1 text-[11px] font-bold tracking-wide text-primary-foreground uppercase">
          {slide.eyebrow}
        </span>

        {slide.kind === "brand" ? (
          <p className="text-balance-tight mt-3 text-2xl leading-[1.1] font-extrabold text-primary-foreground sm:text-3xl lg:text-4xl">
            {slide.title}
            <span className="block text-primary-foreground/90">{slide.accent}</span>
          </p>
        ) : (
          <p className="text-balance-tight mt-3 text-2xl leading-[1.1] font-extrabold text-primary-foreground sm:text-3xl lg:text-4xl">
            {slide.title}
          </p>
        )}

        <p className="mt-3 max-w-md text-sm leading-relaxed text-primary-foreground/80 sm:text-base">
          {slide.description}
        </p>

        {slide.kind === "brand" ? (
          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs font-semibold text-primary-foreground/85">
            <span className="flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Reports in 6 hrs
            </span>
            <span className="flex items-center gap-1.5">
              <Home className="h-3.5 w-3.5" /> Free home visit
            </span>
            <span className="flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5 fill-warning text-warning" /> 4.9 rated · 2.4L+ reviews
            </span>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-5">
            <div>
              <p className="text-xs font-semibold text-primary-foreground/70">
                {slide.tests} parameters · at just
              </p>
              <p className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-primary-foreground">₹{slide.price}</span>
                <span className="text-sm text-primary-foreground/55 line-through">₹{slide.mrp}</span>
                {discount !== null ? (
                  <span className="text-xs font-bold text-primary-foreground">{discount}% off</span>
                ) : null}
              </p>
            </div>
            <Link to="/packages/$slug" params={{ slug: slide.slug! }}>
              <ActionButton variant="light" size="md">
                Book Now <ArrowRight className="h-4 w-4" />
              </ActionButton>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export function Hero() {
  const [api, setApi] = useState<CarouselApi>();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setSelectedIndex(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  useEffect(() => {
    if (!api || isPaused) return;
    const interval = setInterval(() => {
      api.scrollNext();
    }, 5000);
    return () => clearInterval(interval);
  }, [api, isPaused]);

  return (
    <section id="top" className="mesh-hero relative overflow-hidden">
      <div className="grid-lines pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(70%_60%_at_50%_0%,black,transparent)]" />
      <div className="relative mx-auto max-w-[1600px] px-3 py-6 sm:px-4 lg:px-6 lg:py-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="relative overflow-hidden rounded-[1.75rem] shadow-[var(--shadow-lift)]"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          <Carousel opts={{ loop: true }} setApi={setApi} className="w-full">
            <CarouselContent className="ml-0">
              {slides.map((slide) => (
                <CarouselItem key={slide.id} className="basis-full pl-0">
                  <SlidePanel slide={slide} />
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>

          {/* Fixed overlay: search bar + quick tags stay put while slides rotate behind them */}
          <div className="absolute inset-x-0 bottom-0 z-20 px-5 pb-5 sm:px-8 sm:pb-6 lg:px-10 lg:pb-7">
            <div className="mx-auto max-w-3xl lg:mx-0">
              <div className="flex items-center gap-2 rounded-2xl bg-card p-2 shadow-[var(--shadow-lift)] sm:gap-3 sm:p-2.5">
                <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl bg-muted px-3.5 py-2.5 sm:px-4 sm:py-3">
                  <Search className="h-4.5 w-4.5 shrink-0 text-primary sm:h-5 sm:w-5" />
                  <input
                    type="search"
                    aria-label="Search tests and health packages"
                    placeholder="Search a test, package or health concern…"
                    className="w-full min-w-0 bg-transparent text-sm font-medium placeholder:text-muted-foreground focus:outline-none"
                  />
                </div>
                <ActionButton variant="primary" size="md" className="shrink-0">
                  Search
                </ActionButton>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-primary-foreground/80">Popular:</span>
                {quickSearches.map((q) => (
                  <button
                    key={q}
                    className="rounded-full border border-primary-foreground/25 bg-primary-foreground/10 px-3 py-1 text-xs font-semibold text-primary-foreground backdrop-blur-sm transition-colors hover:bg-primary-foreground/20"
                  >
                    {q}
                  </button>
                ))}
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                <a
                  href="/dashboard#reports"
                  className="flex items-center gap-2 rounded-full bg-primary-foreground px-4 py-2 text-xs font-bold text-primary shadow-[var(--shadow-soft)] transition-colors hover:bg-primary-foreground/90"
                >
                  <Download className="h-3.5 w-3.5" /> Download Report
                </a>
                <button
                  type="button"
                  onClick={() => setUploadOpen(true)}
                  className="flex items-center gap-2 rounded-full bg-primary-foreground px-4 py-2 text-xs font-bold text-primary shadow-[var(--shadow-soft)] transition-colors hover:bg-primary-foreground/90"
                >
                  <FileUp className="h-3.5 w-3.5" /> Upload Prescription
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="mt-4 flex items-center justify-center gap-2">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-label={`Show slide ${i + 1}: ${s.title}`}
              onClick={() => api?.scrollTo(i)}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === selectedIndex ? "w-7 bg-primary" : "w-1.5 bg-border hover:bg-primary/40",
              )}
            />
          ))}
        </div>

      </div>

      <h1 className="sr-only">MD Path Lab — NABL accredited lab tests and full body checkups at home</h1>

      <Dialog
        open={uploadOpen}
        onOpenChange={(v) => {
          setUploadOpen(v);
          if (!v) setFileName(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload your prescription</DialogTitle>
            <DialogDescription>
              We'll match the exact tests your doctor ordered — no guesswork on your end.
            </DialogDescription>
          </DialogHeader>

          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted p-8 text-center transition-colors hover:border-primary/40 hover:bg-primary-soft">
            <UploadCloud className="h-8 w-8 text-primary" />
            <span className="text-sm font-bold">{fileName ?? "Click to choose a file"}</span>
            <span className="text-xs text-muted-foreground">JPG, PNG or PDF, up to 10MB</span>
            <input
              type="file"
              accept="image/*,.pdf"
              className="sr-only"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
            />
          </label>

          <DialogFooter>
            {fileName ? (
              <Link to="/book" onClick={() => setUploadOpen(false)}>
                <ActionButton variant="primary" size="md" className="w-full sm:w-auto">
                  Continue to booking
                </ActionButton>
              </Link>
            ) : (
              <ActionButton variant="primary" size="md" className="w-full sm:w-auto" disabled>
                Continue to booking
              </ActionButton>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
