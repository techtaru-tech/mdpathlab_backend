import { Check, X } from "lucide-react";
import type { OrderStatus } from "@/lib/api";
import { ORDER_STATUS_META, ORDER_STATUS_TIMELINE } from "@/lib/orderStatus";
import { cn } from "@/lib/utils";

export function StatusTimeline({ status }: { status: OrderStatus }) {
  if (status === "CANCELLED") {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-destructive/10 p-4 text-sm font-bold text-destructive">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-destructive/15">
          <X className="h-4 w-4" />
        </span>
        This booking was cancelled.
      </div>
    );
  }

  // PENDING_PAYMENT sits before the tracked chain — nothing to show as "reached" yet.
  const currentIndex = ORDER_STATUS_TIMELINE.indexOf(status);

  return (
    <div className="flex flex-col gap-0">
      {ORDER_STATUS_TIMELINE.map((step, i) => {
        const reached = currentIndex >= i;
        const isLast = i === ORDER_STATUS_TIMELINE.length - 1;
        return (
          <div key={step} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold",
                  reached ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {reached ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              {!isLast ? <span className={cn("mt-1 w-0.5 flex-1", reached ? "bg-primary" : "bg-border")} /> : null}
            </div>
            <div className={cn("pb-6 text-sm font-bold", reached ? "text-foreground" : "text-muted-foreground")}>
              {ORDER_STATUS_META[step].label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
