import { Check, X } from "lucide-react";
import type { Order, TrackingStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

// The live booking timeline: Booking confirmed → Phlebotomist assigned → On the way → Sample collected →
// Sample processing → Report ready, each with the time it happened. Driven by the API's trackingStatus (On the
// way is a time on the order, not a status); falls back to the plain status for an older response.
const STEPS: { key: TrackingStatus; label: string; at: (o: Order) => string | null | undefined }[] = [
  { key: "CONFIRMED", label: "Booking confirmed", at: (o) => o.createdAt },
  { key: "ASSIGNED", label: "Phlebotomist assigned", at: (o) => o.assignedAt },
  { key: "ON_THE_WAY", label: "On the way", at: (o) => o.onTheWayAt },
  { key: "SAMPLE_COLLECTED", label: "Sample collected", at: (o) => o.sampleCollectedAt },
  { key: "IN_LAB", label: "Sample processing", at: (o) => o.inLabAt },
  { key: "REPORT_READY", label: "Report ready", at: (o) => o.reportReadyAt },
];

function currentStep(o: Order): TrackingStatus {
  if (o.trackingStatus) return o.trackingStatus;
  if (o.status === "PHLEBOTOMIST_ASSIGNED") return o.onTheWayAt ? "ON_THE_WAY" : "ASSIGNED";
  return o.status as TrackingStatus;
}

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

export function StatusTimeline({ order }: { order: Order }) {
  const step = currentStep(order);
  if (step === "CANCELLED") {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-destructive/10 p-4 text-sm font-bold text-destructive">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-destructive/15">
          <X className="h-4 w-4" />
        </span>
        This booking was cancelled{order.cancelledAt ? ` on ${formatTime(order.cancelledAt)}` : ""}.
      </div>
    );
  }

  // PENDING_PAYMENT sits before the tracked chain — nothing to show as reached yet.
  const currentIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="flex flex-col gap-0">
      {STEPS.map((s, i) => {
        const reached = currentIndex >= i;
        const isCurrent = currentIndex === i;
        const isLast = i === STEPS.length - 1;
        const at = reached ? s.at(order) : null;
        return (
          <div key={s.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold",
                  reached ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  isCurrent && !isLast && "ring-4 ring-primary/20",
                )}
              >
                {reached ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              {!isLast ? <span className={cn("mt-1 w-0.5 flex-1", currentIndex > i ? "bg-primary" : "bg-border")} /> : null}
            </div>
            <div className="pb-6">
              <p className={cn("text-sm font-bold", reached ? "text-foreground" : "text-muted-foreground")}>{s.label}</p>
              {at ? <p className="text-xs text-muted-foreground">{formatTime(at)}</p> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
