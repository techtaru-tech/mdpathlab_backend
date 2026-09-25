import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Check, FileText, User } from "lucide-react";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { apiFileUrl, ApiError, cartApi, prescriptionsApi, type Prescription, type PrescriptionLabStage } from "@/lib/api";
import { notifyCartChanged } from "@/lib/cartEvents";
import { setActivePrescriptionId } from "@/lib/prescriptionBooking";
import { useAuthed } from "@/lib/useAuthed";
import { cn } from "@/lib/utils";

const title = "Prescription Review — MD Path Lab";

export const Route = createFileRoute("/prescriptions/$id")({
  head: () => ({ meta: [{ title }, { name: "robots", content: "noindex" }] }),
  component: PrescriptionDetailPage,
});

// Mirrors the patient-facing wording from the product spec exactly — "Prescription Uploaded" →
// "Under Lab Review" → "Prescription Reviewed" → "Tests Recommended" → "Ready for Booking" →
// "Booking Confirmed". REVIEWED covers both "Prescription Reviewed" and "Tests Recommended" since
// the lab submits its recommended-tests list in one action that completes both at once.
const STEPS: { stage: PrescriptionLabStage; label: string }[] = [
  { stage: "UPLOADED", label: "Prescription Uploaded" },
  { stage: "UNDER_REVIEW", label: "Under Lab Review" },
  { stage: "REVIEWED", label: "Tests Recommended" },
  { stage: "READY_FOR_BOOKING", label: "Ready for Booking" },
  { stage: "BOOKING_CONFIRMED", label: "Booking Confirmed" },
];

function stepIndex(stage: PrescriptionLabStage) {
  if (stage === "ACTION_REQUIRED") return 1; // still counts as "under review" on the timeline
  return STEPS.findIndex((s) => s.stage === stage);
}

function StageTimeline({ stage }: { stage: PrescriptionLabStage }) {
  const currentIndex = stepIndex(stage);
  return (
    <div className="flex flex-col gap-0">
      {STEPS.map((step, i) => {
        const reached = currentIndex >= i;
        const isLast = i === STEPS.length - 1;
        return (
          <div key={step.stage} className="flex gap-3">
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
            <div className={cn("pb-6 text-sm font-bold", reached ? "text-foreground" : "text-muted-foreground")}>{step.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function PrescriptionDetailPage() {
  const { id } = Route.useParams();
  const isAuthed = useAuthed();

  const [prescription, setPrescription] = useState<Prescription | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [reply, setReply] = useState("");
  const [savingReply, setSavingReply] = useState(false);
  const [savingSelection, setSavingSelection] = useState(false);
  const [startingBooking, setStartingBooking] = useState(false);
  const [actionError, setActionError] = useState("");

  function load() {
    setLoading(true);
    prescriptionsApi
      .get(id)
      .then((p) => {
        setPrescription(p);
        setSelection(Object.fromEntries(p.recommendedTests.map((t) => [t.id, t.selected])));
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Couldn't load this prescription"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (isAuthed) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed, id]);

  const total = useMemo(() => {
    if (!prescription) return 0;
    return prescription.recommendedTests.filter((t) => t.available && selection[t.id]).reduce((sum, t) => sum + t.price, 0);
  }, [prescription, selection]);

  async function handleReply() {
    if (!reply.trim()) return;
    setSavingReply(true);
    setActionError("");
    try {
      const updated = await prescriptionsApi.replyClarification(id, reply.trim());
      setPrescription(updated);
      setReply("");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Couldn't send your reply");
    } finally {
      setSavingReply(false);
    }
  }

  async function handleConfirmSelection() {
    if (!prescription) return;
    setSavingSelection(true);
    setActionError("");
    try {
      const selections = prescription.recommendedTests
        .filter((t) => t.available)
        .map((t) => ({ recommendedTestId: t.id, selected: Boolean(selection[t.id]) }));
      const updated = await prescriptionsApi.confirmTests(id, selections);
      setPrescription(updated);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Couldn't save your selection");
    } finally {
      setSavingSelection(false);
    }
  }

  async function handleProceedToBooking() {
    if (!prescription) return;
    setStartingBooking(true);
    setActionError("");
    try {
      const toBook = prescription.recommendedTests.filter((t) => t.available && selection[t.id]);
      if (toBook.length === 0) {
        setActionError("Select at least one test to continue");
        setStartingBooking(false);
        return;
      }
      for (const t of toBook) {
        await cartApi.add({ itemType: t.itemType, itemId: t.itemId });
      }
      notifyCartChanged();
      setActivePrescriptionId(prescription.id);
      window.location.href = "/checkout";
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Couldn't start booking — please try again");
      setStartingBooking(false);
    }
  }

  if (isAuthed === false) {
    return (
      <section className="py-16">
        <div className="container-page mx-auto max-w-md">
          <div className="surface-card p-10 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-primary">
              <User className="h-7 w-7" />
            </span>
            <h1 className="mt-5 text-xl font-extrabold">Log in to view this prescription</h1>
            <Link to="/login" search={{ redirect: `/prescriptions/${id}` }} className="mt-6 block">
              <ActionButton variant="primary" size="lg" className="w-full">
                Log in
              </ActionButton>
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (loading || isAuthed === null) {
    return (
      <section className="py-16">
        <div className="container-page mx-auto max-w-3xl">
          <div className="h-64 animate-pulse rounded-2xl bg-muted" />
        </div>
      </section>
    );
  }

  if (loadError || !prescription) {
    return (
      <section className="py-16">
        <div className="container-page mx-auto max-w-md text-center">
          <p className="text-sm font-semibold text-destructive">{loadError || "Prescription not found"}</p>
        </div>
      </section>
    );
  }

  const hasRecommendations = prescription.recommendedTests.length > 0;
  const canEditSelection = prescription.labStage === "REVIEWED" || prescription.labStage === "READY_FOR_BOOKING";
  const canProceed = prescription.labStage === "READY_FOR_BOOKING";

  return (
    <section className="py-12 lg:py-16">
      <div className="container-page mx-auto max-w-3xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Prescription</p>
            <h1 className="mt-1 text-2xl font-extrabold">
              {prescription.lab ? prescription.lab.name : "Uploaded prescription"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Uploaded {new Date(prescription.createdAt).toLocaleDateString("en-IN")}</p>
          </div>
          <a
            href={apiFileUrl(prescription.fileUrl)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-primary hover:bg-primary-soft"
          >
            <FileText className="h-4 w-4" /> View prescription
          </a>
        </div>

        {!prescription.lab ? (
          <div className="surface-card mt-6 p-6">
            <p className="text-sm font-semibold">
              {prescription.status === "REVIEWED"
                ? "Our team has reviewed your prescription. We'll reach out with next steps."
                : "Your prescription is with our team for review. We'll notify you once it's done."}
            </p>
          </div>
        ) : (
          <>
            <div className="surface-card mt-6 p-6">
              <StageTimeline stage={prescription.labStage} />
            </div>

            {prescription.labStage === "ACTION_REQUIRED" ? (
              <div className="surface-card mt-6 border border-warning/30 bg-warning/10 p-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-extrabold">Action required</h2>
                    <p className="mt-1 text-sm text-foreground/80">{prescription.clarificationNote}</p>
                    <textarea
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder="Type your reply…"
                      rows={3}
                      className="mt-3 w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm focus:border-primary/40 focus:outline-none"
                    />
                    <ActionButton variant="primary" size="sm" className="mt-3" disabled={savingReply || !reply.trim()} onClick={handleReply}>
                      {savingReply ? "Sending…" : "Send reply"}
                    </ActionButton>
                  </div>
                </div>
              </div>
            ) : null}

            {hasRecommendations ? (
              <div className="surface-card mt-6 p-6">
                <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Recommended Tests</h2>
                <p className="mt-1 text-xs text-muted-foreground">Based on the tests your doctor mentioned in the prescription.</p>

                <div className="mt-4 divide-y divide-border">
                  {prescription.recommendedTests.map((t) => (
                    <label
                      key={t.id}
                      className={cn(
                        "flex items-start gap-3 py-3.5",
                        !t.available && "opacity-60",
                        t.available && canEditSelection && "cursor-pointer",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={t.available && Boolean(selection[t.id])}
                        disabled={!t.available || !canEditSelection}
                        onChange={(e) => setSelection((prev) => ({ ...prev, [t.id]: e.target.checked }))}
                        className="mt-1 h-4.5 w-4.5 shrink-0 accent-primary"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold">{t.name}</p>
                        {t.shortDescription ? <p className="text-xs text-muted-foreground">{t.shortDescription}</p> : null}
                        {!t.available ? (
                          <p className="mt-1 text-xs font-bold text-destructive">
                            Not available at this lab{t.unavailableNote ? ` — ${t.unavailableNote}` : ""}
                          </p>
                        ) : null}
                      </div>
                      {t.available ? (
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-extrabold text-primary">₹{t.price}</p>
                          {t.mrp > t.price ? <p className="text-xs text-muted-foreground line-through">₹{t.mrp}</p> : null}
                        </div>
                      ) : null}
                    </label>
                  ))}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                  <p className="text-sm font-bold text-muted-foreground">Total</p>
                  <p className="text-xl font-extrabold">₹{total}</p>
                </div>

                {actionError ? <p className="mt-3 text-sm font-semibold text-destructive">{actionError}</p> : null}

                <div className="mt-4 flex flex-wrap gap-3">
                  {canEditSelection ? (
                    <ActionButton variant="outline" size="md" disabled={savingSelection} onClick={handleConfirmSelection}>
                      {savingSelection ? "Saving…" : "Confirm selection"}
                    </ActionButton>
                  ) : null}
                  {canProceed ? (
                    <ActionButton variant="primary" size="md" disabled={startingBooking} onClick={handleProceedToBooking}>
                      {startingBooking ? "Starting…" : "Proceed to Booking"}
                    </ActionButton>
                  ) : null}
                  {prescription.labStage === "BOOKING_CONFIRMED" && prescription.orderId ? (
                    <Link to="/booking/$orderId" params={{ orderId: prescription.orderId }}>
                      <ActionButton variant="primary" size="md">
                        View booking
                      </ActionButton>
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
