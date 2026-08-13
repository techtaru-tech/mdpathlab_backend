import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Sparkles } from "lucide-react";
import { offersApi, apiFileUrl, type Offer } from "@/lib/api";
import { SectionHeading } from "@/components/ui-kit/SectionHeading";
import { Reveal } from "@/components/ui-kit/Reveal";
import { cn } from "@/lib/utils";

export function Offers() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: "start", loop: true, slidesToScroll: 1 });
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    offersApi
      .list()
      .then(setOffers)
      .catch(() => setOffers([]))
      .finally(() => setLoaded(true));
  }, []);

  const onSelect = useCallback(() => {
    if (emblaApi) setSelected(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi, onSelect]);

  if (loaded && offers.length === 0) return null;

  return (
    <section className="py-10 lg:py-16">
      <div className="container-page">
        <SectionHeading
          eyebrow={
            <>
              <Sparkles className="h-3.5 w-3.5" /> Offers for you
            </>
          }
          title="Limited-time deals on your next checkup"
          description="Hand-picked by our team — updated regularly, no hidden terms."
          action={
            offers.length > 1 ? (
              <div className="flex gap-3">
                <button
                  aria-label="Previous offers"
                  onClick={() => emblaApi?.scrollPrev()}
                  className="grid h-12 w-12 place-items-center rounded-full border border-border bg-card text-primary transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[var(--shadow-soft)]"
                >
                  <ArrowLeft className="h-4.5 w-4.5" />
                </button>
                <button
                  aria-label="Next offers"
                  onClick={() => emblaApi?.scrollNext()}
                  className="grid h-12 w-12 place-items-center rounded-full border border-border bg-card text-primary transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[var(--shadow-soft)]"
                >
                  <ArrowRight className="h-4.5 w-4.5" />
                </button>
              </div>
            ) : undefined
          }
        />

        {!loaded ? (
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-64 animate-pulse rounded-[var(--radius-lg)] bg-muted" />
            ))}
          </div>
        ) : (
          <Reveal>
            <div className="mt-10 overflow-hidden" ref={emblaRef}>
              <div className="flex gap-6">
                {offers.map((o) => (
                  <a
                    key={o.id}
                    href={o.ctaLink || "#"}
                    className={cn(
                      "group relative min-w-0 shrink-0 grow-0 basis-[88%] overflow-hidden rounded-[var(--radius-lg)] shadow-[var(--shadow-lift)] sm:basis-[60%] lg:basis-[38%]",
                      !o.ctaLink && "pointer-events-none",
                    )}
                  >
                    <img
                      src={apiFileUrl(o.imageUrl)}
                      alt={o.title}
                      className="h-64 w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-6">
                      <p className="text-lg leading-snug font-extrabold text-white sm:text-xl">{o.title}</p>
                      {o.subtitle ? <p className="mt-1 text-sm text-white/80">{o.subtitle}</p> : null}
                      {o.ctaLink ? (
                        <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-bold text-primary transition-transform group-hover:translate-x-0.5">
                          {o.ctaLabel} <ArrowUpRight className="h-3.5 w-3.5" />
                        </span>
                      ) : null}
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </Reveal>
        )}

        {offers.length > 1 ? (
          <div className="mt-8 flex justify-center gap-2">
            {offers.map((o, i) => (
              <button
                key={o.id}
                aria-label={`Go to offer ${i + 1}`}
                onClick={() => emblaApi?.scrollTo(i)}
                className={cn(
                  "h-2 rounded-full transition-all duration-300",
                  selected === i ? "w-8 bg-secondary" : "w-2 bg-border hover:bg-primary/30",
                )}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
