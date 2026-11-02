import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarClock, Check, Home as HomeIcon, MapPin, Phone, Stethoscope, User, X } from "lucide-react";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { ApiError, homeVisitsApi, type MyHomeVisit } from "@/lib/api";
import { cn } from "@/lib/utils";

// The journey of a home visit, as the customer sees it. Collected / report ready come from the booking the
// phlebotomist creates at the door.
const STEPS: { status: MyHomeVisit["status"]; label: string }[] = [
  { status: "REQUESTED", label: "Requested" },
  { status: "ASSIGNED", label: "Phlebotomist assigned" },
  { status: "ON_THE_WAY", label: "On the way" },
  { status: "ARRIVED", label: "Arrived" },
  { status: "TESTS_ADDED", label: "Tests added" },
  { status: "COLLECTED", label: "Sample collected" },
  { status: "COMPLETED", label: "Report ready" },
];

const STATUS_TEXT: Record<MyHomeVisit["status"], string> = {
  REQUESTED: "Requested — we'll assign a phlebotomist and notify you",
  ASSIGNED: "Phlebotomist assigned",
  ON_THE_WAY: "Phlebotomist is on the way",
  ARRIVED: "Phlebotomist has arrived",
  TESTS_ADDED: "Tests added — your booking is created",
  COLLECTED: "Sample collected",
  COMPLETED: "Report ready",
  CANCELLED: "Cancelled",
  NO_SHOW: "Visit missed",
};

const OPEN: MyHomeVisit["status"][] = ["REQUESTED", "ASSIGNED", "ON_THE_WAY", "ARRIVED", "TESTS_ADDED", "COLLECTED"];

const istTime = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
const prettyDate = (ymd: string) =>
  new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Dashboard → My Home Visits: every visit with its progress, who is coming and when; refreshes while one is open. */
export function MyHomeVisits() {
  const [visits, setVisits] = useState<MyHomeVisit[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Visits still in progress first (soonest first), then the rest, newest first.
  const load = () =>
    homeVisitsApi
      .listMine()
      .then((list) =>
        setVisits(
          [...list].sort((a, b) => {
            const ao = OPEN.includes(a.status) ? 0 : 1;
            const bo = OPEN.includes(b.status) ? 0 : 1;
            if (ao !== bo) return ao - bo;
            return ao === 0 ? a.preferredDate.localeCompare(b.preferredDate) : b.createdAt.localeCompare(a.createdAt);
          }),
        ),
      )
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load your home visits"));

  useEffect(() => {
    load();
  }, []);

  const hasOpen = Boolean(visits?.some((v) => OPEN.includes(v.status)));
  useEffect(() => {
    if (!hasOpen) return;
    const refresh = () => {
      if (document.visibilityState === "visible") load();
    };
    const t = setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [hasOpen]);

  async function cancel(v: MyHomeVisit) {
    if (!window.confirm(`Cancel the home visit on ${prettyDate(v.preferredDate)}, ${v.windowLabel}?`)) return;
    setBusyId(v.id);
    setError("");
    try {
      await homeVisitsApi.cancel(v.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't cancel this visit");
    } finally {
      setBusyId(null);
    }
  }

  if (visits === null && !error) return <div className="h-40 animate-pulse rounded-2xl bg-muted" />;

  return (
    <div className="space-y-4">
      {error ? <p className="rounded-xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">{error}</p> : null}
      {visits && visits.length === 0 ? (
        <div className="py-8 text-center">
          <HomeIcon className="mx-auto h-8 w-8 text-primary" />
          <p className="mt-3 text-sm text-muted-foreground">No home visits yet. Not sure which tests you need? A phlebotomist can help you decide at your door.</p>
          <Link to="/home-visit" className="mt-4 inline-block">
            <ActionButton variant="primary" size="sm">
              Book a home visit
            </ActionButton>
          </Link>
        </div>
      ) : null}

      {visits?.map((v) => {
        const ended = v.status === "CANCELLED" || v.status === "NO_SHOW";
        const at = STEPS.findIndex((s) => s.status === v.status);
        return (
          <div key={v.id} className="surface-card overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dashed border-border p-5 pb-4">
              <div>
                <p className="flex items-center gap-2 font-extrabold">
                  <CalendarClock className="h-4 w-4 text-primary" /> {prettyDate(v.preferredDate)} · {v.windowLabel}
                </p>
                <p className={cn("mt-1 text-sm font-semibold", ended ? "text-destructive" : "text-primary")}>{STATUS_TEXT[v.status]}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {v.orderId ? (
                  <Link to="/booking/$orderId" params={{ orderId: v.orderId }}>
                    <ActionButton variant="outline" size="sm">
                      View booking {v.orderNumber ? `· ${v.orderNumber}` : ""}
                    </ActionButton>
                  </Link>
                ) : null}
                {v.status === "REQUESTED" || v.status === "ASSIGNED" ? (
                  <ActionButton variant="outline" size="sm" disabled={busyId === v.id} onClick={() => cancel(v)}>
                    {busyId === v.id ? "Cancelling…" : "Cancel visit"}
                  </ActionButton>
                ) : null}
              </div>
            </div>

            <div className="grid gap-5 p-5 md:grid-cols-[1.1fr_1fr]">
              <div className="space-y-2 text-sm">
                <p className="flex items-start gap-2">
                  <User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>
                    {v.patientName}
                    {v.age ? `, ${v.age} yrs` : ""}
                    {v.gender ? ` · ${v.gender.charAt(0)}${v.gender.slice(1).toLowerCase()}` : ""} · {v.phone}
                  </span>
                </p>
                <p className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>
                    {v.address}, {v.city} {v.pincode}
                  </span>
                </p>
                {v.concern ? (
                  <p className="flex items-start gap-2 text-muted-foreground">
                    <Stethoscope className="mt-0.5 h-4 w-4 shrink-0" /> {v.concern}
                  </p>
                ) : null}
                {v.phlebotomist && !ended ? (
                  <div className="mt-3 rounded-lg bg-primary-soft p-3 text-xs font-bold text-primary">
                    <p className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5" /> Your phlebotomist: {v.phlebotomist.name ?? "—"}
                    </p>
                    <a href={`tel:${v.phlebotomist.phone}`} className="mt-1 flex items-center gap-2 hover:underline">
                      <Phone className="h-3.5 w-3.5" /> {v.phlebotomist.phone}
                    </a>
                    {v.eta && (v.status === "ASSIGNED" || v.status === "ON_THE_WAY") ? <p className="mt-1">Expected around {istTime(v.eta)}</p> : null}
                  </div>
                ) : null}
                {ended && v.cancelReason ? <p className="text-xs text-muted-foreground">{v.cancelReason}</p> : null}
              </div>

              {ended ? (
                <div className="flex items-start gap-3 self-start rounded-xl bg-destructive/10 p-4 text-sm font-bold text-destructive">
                  <X className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {v.status === "CANCELLED" ? "This visit was cancelled." : "This visit was missed."}{" "}
                    <Link to="/home-visit" className="underline">
                      Book a new one
                    </Link>
                  </span>
                </div>
              ) : (
                <ol className="space-y-0">
                  {STEPS.map((s, i) => {
                    const reached = at >= i;
                    return (
                      <li key={s.status} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span
                            className={cn(
                              "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold",
                              reached ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                              at === i && i < STEPS.length - 1 && "ring-4 ring-primary/20",
                            )}
                          >
                            {reached ? <Check className="h-3 w-3" /> : i + 1}
                          </span>
                          {i < STEPS.length - 1 ? <span className={cn("w-0.5 flex-1", at > i ? "bg-primary" : "bg-border")} style={{ minHeight: 14 }} /> : null}
                        </div>
                        <p className={cn("pb-3 text-xs font-bold", reached ? "text-foreground" : "text-muted-foreground")}>{s.label}</p>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
