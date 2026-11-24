import { useEffect, useState } from "react";
import { Star, X } from "lucide-react";
import { cn } from "@/lib/utils";

// GET /admin/phlebotomists/:id/ratings and GET /lab/phlebotomists/:id/ratings (same shape as the phlebotomist app's
// GET /phlebotomist/reviews).
export type PhlebotomistRatings = {
  rating: number | null;
  ratingCount: number;
  stars: Record<"1" | "2" | "3" | "4" | "5", number>;
  reviews: {
    id: string;
    rating: number;
    comment: string | null;
    createdAt: string;
    orderId: string;
    orderNumber: string;
    visitDate: string | null;
    customerName: string;
  }[];
};

function Stars({ value, size = "h-3.5 w-3.5" }: { value: number; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={cn(size, i < Math.round(value) ? "fill-warning text-warning" : "text-border")} />
      ))}
    </span>
  );
}

/** The rating cell in a phlebotomist table: "★ 4.6 (12)", or "No ratings". Clicking opens the full list. */
export function RatingCell({ rating, ratingCount, onOpen }: { rating: number | null | undefined; ratingCount: number | undefined; onOpen: () => void }) {
  if (!ratingCount) return <span className="text-xs text-muted-foreground">No ratings</span>;
  return (
    <button type="button" onClick={onOpen} className="inline-flex items-center gap-1 text-xs font-bold whitespace-nowrap hover:underline">
      <Star className="h-3.5 w-3.5 fill-warning text-warning" /> {rating?.toFixed(1)} <span className="font-semibold text-muted-foreground">({ratingCount})</span>
    </button>
  );
}

/** Every rating patients gave one phlebotomist, newest first, with the star breakdown. */
export function PhlebotomistRatingsDialog({ name, load, onClose }: { name: string; load: () => Promise<PhlebotomistRatings>; onClose: () => void }) {
  const [data, setData] = useState<PhlebotomistRatings | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    load()
      .then(setData)
      .catch(() => setError("Couldn't load the ratings — please try again"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Ratings for ${name}`}
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-5">
          <div>
            <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Patient ratings</p>
            <h2 className="text-lg font-extrabold">{name}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5">
          {error ? (
            <p className="text-sm font-semibold text-destructive">{error}</p>
          ) : !data ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : data.ratingCount === 0 ? (
            <p className="text-sm text-muted-foreground">No ratings yet.</p>
          ) : (
            <>
              <div className="flex items-center gap-5">
                <div className="text-center">
                  <p className="text-4xl font-extrabold">{data.rating?.toFixed(1)}</p>
                  <Stars value={data.rating ?? 0} size="h-4 w-4" />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {data.ratingCount} rating{data.ratingCount === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex-1 space-y-1">
                  {(["5", "4", "3", "2", "1"] as const).map((s) => (
                    <div key={s} className="flex items-center gap-2 text-xs">
                      <span className="w-3 font-bold">{s}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-warning" style={{ width: `${(data.stars[s] / data.ratingCount) * 100}%` }} />
                      </div>
                      <span className="w-6 text-right text-muted-foreground">{data.stars[s]}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {data.reviews.map((r) => (
                  <div key={r.id} className="rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Stars value={r.rating} />
                      <span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                    </div>
                    {r.comment ? <p className="mt-1.5 text-sm">"{r.comment}"</p> : null}
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {r.customerName} · Booking {r.orderNumber}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
