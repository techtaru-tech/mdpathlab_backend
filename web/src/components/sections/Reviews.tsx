import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ArrowLeft, ArrowRight, BadgeCheck, MessageSquareHeart, Star } from "lucide-react";
import { reviews } from "@/data/site";
import { SectionHeading } from "@/components/ui-kit/SectionHeading";
import { Reveal } from "@/components/ui-kit/Reveal";
import { cn } from "@/lib/utils";

export function Reviews() {
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: "start", loop: true, slidesToScroll: 1 });
  const [selected, setSelected] = useState(0);

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

  return (
    <section id="reviews" className="scroll-mt-16 bg-surface py-10 lg:py-16 lg:scroll-mt-32">
      <div className="container-page">
        <SectionHeading
          eyebrow={
            <>
              <MessageSquareHeart className="h-3.5 w-3.5" /> Customer stories
            </>
          }
          title="2.4 lakh verified reviews. 4.9 average rating."
          description="Every review below comes from a completed booking — we never edit, filter or incentivise them."
          action={
            <div className="flex gap-3">
              <button
                aria-label="Previous reviews"
                onClick={() => emblaApi?.scrollPrev()}
                className="grid h-12 w-12 place-items-center rounded-full border border-border bg-card text-primary transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[var(--shadow-soft)]"
              >
                <ArrowLeft className="h-4.5 w-4.5" />
              </button>
              <button
                aria-label="Next reviews"
                onClick={() => emblaApi?.scrollNext()}
                className="grid h-12 w-12 place-items-center rounded-full border border-border bg-card text-primary transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[var(--shadow-soft)]"
              >
                <ArrowRight className="h-4.5 w-4.5" />
              </button>
            </div>
          }
        />

        <Reveal>
          <div className="mt-12 overflow-hidden" ref={emblaRef}>
            <div className="flex gap-6">
              {reviews.map((r) => (
                <article
                  key={r.name}
                  className="surface-card lift-on-hover flex min-w-0 shrink-0 grow-0 basis-[88%] flex-col p-7 sm:basis-[48%] lg:basis-[32%]"
                >
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={cn(
                          "h-4 w-4",
                          i < r.rating ? "fill-warning text-warning" : "text-border",
                        )}
                      />
                    ))}
                  </div>
                  <p className="mt-5 text-sm leading-relaxed text-foreground/85">“{r.text}”</p>
                  <div className="mt-auto flex items-center gap-4 border-t border-border pt-6">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-secondary-soft text-sm font-bold text-secondary">
                      {r.name.charAt(0)}
                    </span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate text-sm font-bold">
                        {r.name}
                        <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-success" />
                      </p>
                      <p className="truncate text-xs font-semibold text-muted-foreground">
                        {r.city} · {r.package}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </Reveal>

        <div className="mt-8 flex justify-center gap-2">
          {reviews.map((r, i) => (
            <button
              key={r.name}
              aria-label={`Go to review ${i + 1}`}
              onClick={() => emblaApi?.scrollTo(i)}
              className={cn(
                "h-2 rounded-full transition-all duration-300",
                selected === i ? "w-8 bg-secondary" : "w-2 bg-border hover:bg-primary/30",
              )}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
