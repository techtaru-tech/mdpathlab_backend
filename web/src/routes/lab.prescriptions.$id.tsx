import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, FileText, Plus, Search, Trash2 } from "lucide-react";
import { LabLayout } from "@/components/lab/LabLayout";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { apiFileUrl } from "@/lib/api";
import {
  LabApiError,
  labPrescriptionsApi,
  type LabPrescription,
  type LabPrescriptionRecommendedTest,
  type LabSearchableCatalogueItem,
} from "@/lib/lab-api";

export const Route = createFileRoute("/lab/prescriptions/$id")({
  head: () => ({ meta: [{ title: "Prescription Review — Lab Dashboard" }, { name: "robots", content: "noindex" }] }),
  component: LabPrescriptionDetailPage,
});

const stageMeta: Record<string, { label: string; tone: "warning" | "success" | "primary" | "secondary" | "danger" }> = {
  UPLOADED: { label: "New", tone: "warning" },
  UNDER_REVIEW: { label: "Under review", tone: "primary" },
  ACTION_REQUIRED: { label: "Action required", tone: "danger" },
  REVIEWED: { label: "Tests recommended", tone: "success" },
  READY_FOR_BOOKING: { label: "Ready for booking", tone: "success" },
  BOOKING_CONFIRMED: { label: "Booking confirmed", tone: "success" },
};

// The lab's editable draft of one recommended test — a superset of what gets submitted, kept
// separate from LabPrescriptionRecommendedTest so a not-yet-submitted addition doesn't need a
// server-issued id yet.
type DraftItem = {
  key: string;
  itemType: "PARAMETER" | "PROFILE" | "PACKAGE";
  itemId: string;
  name: string;
  shortDescription: string | null;
  price: number;
  mrp: number;
  available: boolean;
  unavailableNote: string;
};

function toDraft(t: LabPrescriptionRecommendedTest): DraftItem {
  return {
    key: `${t.itemType}:${t.itemId}`,
    itemType: t.itemType,
    itemId: t.itemId,
    name: t.name,
    shortDescription: t.shortDescription,
    price: t.price,
    mrp: t.mrp,
    available: t.available,
    unavailableNote: t.unavailableNote ?? "",
  };
}

function formatDob(dob: string | null) {
  if (!dob) return null;
  const age = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return `${age} yrs`;
}

function LabPrescriptionDetailPage() {
  const { id } = Route.useParams();

  const [prescription, setPrescription] = useState<LabPrescription | null>(null);
  const [catalogue, setCatalogue] = useState<LabSearchableCatalogueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [draft, setDraft] = useState<DraftItem[]>([]);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  const [clarificationDraft, setClarificationDraft] = useState("");
  const [requestingClarification, setRequestingClarification] = useState(false);

  useEffect(() => {
    Promise.all([labPrescriptionsApi.get(id), labPrescriptionsApi.searchableCatalogue()])
      .then(([p, c]) => {
        setPrescription(p);
        setCatalogue(c);
        setDraft(p.recommendedTests.map(toDraft));
      })
      .catch((err) => setError(err instanceof LabApiError ? err.message : "Couldn't load this prescription"))
      .finally(() => setLoading(false));
  }, [id]);

  const draftKeys = useMemo(() => new Set(draft.map((d) => d.key)), [draft]);
  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    return catalogue.filter((c) => c.name.toLowerCase().includes(q) && !draftKeys.has(`${c.itemType}:${c.itemId}`)).slice(0, 8);
  }, [catalogue, query, draftKeys]);

  function addItem(item: LabSearchableCatalogueItem) {
    setDraft((prev) => [
      ...prev,
      {
        key: `${item.itemType}:${item.itemId}`,
        itemType: item.itemType,
        itemId: item.itemId,
        name: item.name,
        shortDescription: item.shortDescription,
        price: item.price,
        mrp: item.mrp,
        available: true,
        unavailableNote: "",
      },
    ]);
    setQuery("");
  }

  function removeItem(key: string) {
    setDraft((prev) => prev.filter((d) => d.key !== key));
  }

  function toggleAvailable(key: string, available: boolean) {
    setDraft((prev) => prev.map((d) => (d.key === key ? { ...d, available } : d)));
  }

  function setNote(key: string, note: string) {
    setDraft((prev) => prev.map((d) => (d.key === key ? { ...d, unavailableNote: note } : d)));
  }

  async function handleSubmitReview() {
    if (draft.length === 0) {
      setError("Add at least one test identified from the prescription before submitting");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const updated = await labPrescriptionsApi.recommend(
        id,
        draft.map((d) => ({
          itemType: d.itemType,
          itemId: d.itemId,
          available: d.available,
          ...(d.available ? {} : d.unavailableNote ? { unavailableNote: d.unavailableNote } : {}),
        })),
      );
      setPrescription(updated);
      setDraft(updated.recommendedTests.map(toDraft));
    } catch (err) {
      setError(err instanceof LabApiError ? err.message : "Couldn't submit this review");
    } finally {
      setSaving(false);
    }
  }

  async function handleRequestClarification() {
    if (!clarificationDraft.trim()) return;
    setRequestingClarification(true);
    setError("");
    try {
      const updated = await labPrescriptionsApi.requestClarification(id, clarificationDraft.trim());
      setPrescription(updated);
      setClarificationDraft("");
    } catch (err) {
      setError(err instanceof LabApiError ? err.message : "Couldn't send this request");
    } finally {
      setRequestingClarification(false);
    }
  }

  if (loading) {
    return (
      <LabLayout activePath="/lab/prescriptions">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </LabLayout>
    );
  }

  if (!prescription) {
    return (
      <LabLayout activePath="/lab/prescriptions">
        <p className="text-sm font-semibold text-destructive">{error || "Prescription not found"}</p>
      </LabLayout>
    );
  }

  const stage = stageMeta[prescription.labStage ?? "UPLOADED"] ?? stageMeta['UPLOADED']!;

  return (
    <LabLayout activePath="/lab/prescriptions">
      <Link to="/lab/prescriptions" className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-primary">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to prescriptions
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Prescription</p>
          <h1 className="text-xl font-extrabold">{prescription.user.name ?? prescription.user.phone}</h1>
        </div>
        <StatusBadge tone={stage.tone}>{stage.label}</StatusBadge>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Patient details</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Name</dt>
                <dd className="font-semibold">{prescription.user.name ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Phone</dt>
                <dd className="font-semibold">{prescription.user.phone}</dd>
              </div>
              {prescription.user.email ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="font-semibold">{prescription.user.email}</dd>
                </div>
              ) : null}
              {prescription.user.gender || prescription.user.dob ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Age / Gender</dt>
                  <dd className="font-semibold">
                    {formatDob(prescription.user.dob) ?? "—"} {prescription.user.gender ? `/ ${prescription.user.gender}` : ""}
                  </dd>
                </div>
              ) : null}
              {prescription.pincode ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Pincode</dt>
                  <dd className="font-semibold">{prescription.pincode}</dd>
                </div>
              ) : null}
            </dl>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Prescription file</h2>
            {prescription.note ? <p className="mt-2 text-sm text-muted-foreground">{prescription.note}</p> : null}
            <a
              href={apiFileUrl(prescription.fileUrl)}
              target="_blank"
              rel="noreferrer"
              className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-muted px-4 py-2.5 text-sm font-bold text-primary hover:bg-primary-soft"
            >
              <FileText className="h-4 w-4" /> Open prescription
            </a>
          </div>

          {prescription.patientReply ? (
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Patient's reply</h2>
              <p className="mt-2 text-sm">{prescription.patientReply}</p>
            </div>
          ) : null}

          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Need a clarification?</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Ask the patient something before you finish the review — e.g. which of two tests the doctor meant.
            </p>
            <textarea
              value={clarificationDraft}
              onChange={(e) => setClarificationDraft(e.target.value)}
              rows={3}
              placeholder="What do you need to know?"
              className="mt-3 w-full rounded-xl border border-border bg-muted px-3.5 py-2.5 text-sm focus:border-primary/40 focus:outline-none"
            />
            <ActionButton
              variant="outline"
              size="sm"
              className="mt-3"
              disabled={requestingClarification || !clarificationDraft.trim()}
              onClick={handleRequestClarification}
            >
              {requestingClarification ? "Sending…" : "Request clarification"}
            </ActionButton>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Tests identified from the prescription</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Only add what the doctor actually wrote down — search your lab's own catalogue below.
          </p>

          <div className="relative mt-4">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search e.g. CBC, HbA1c, Lipid Profile…"
              className="h-11 w-full rounded-xl border border-border bg-muted px-3.5 pl-9 text-sm font-medium focus:border-primary/40 focus:outline-none"
            />
            {results.length > 0 ? (
              <div className="absolute top-full left-0 z-10 mt-1.5 w-full overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg">
                {results.map((r) => (
                  <button
                    key={`${r.itemType}:${r.itemId}`}
                    type="button"
                    onClick={() => addItem(r)}
                    className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-sm hover:bg-muted"
                  >
                    <span className="font-semibold">{r.name}</span>
                    <span className="flex shrink-0 items-center gap-1.5 text-xs font-bold text-primary">
                      <Plus className="h-3.5 w-3.5" /> ₹{r.price}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="mt-4 space-y-3">
            {draft.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No tests added yet.</p>
            ) : (
              draft.map((d) => (
                <div key={d.key} className="rounded-xl border border-border bg-muted/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold">{d.name}</p>
                      {d.available ? <p className="text-xs text-muted-foreground">₹{d.price}</p> : null}
                    </div>
                    <button type="button" onClick={() => removeItem(d.key)} className="shrink-0 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <label className="mt-2 flex items-center gap-2 text-xs font-semibold">
                    <input
                      type="checkbox"
                      checked={!d.available}
                      onChange={(e) => toggleAvailable(d.key, !e.target.checked)}
                      className="h-4 w-4 accent-destructive"
                    />
                    Not available at this lab
                  </label>
                  {!d.available ? (
                    <input
                      value={d.unavailableNote}
                      onChange={(e) => setNote(d.key, e.target.value)}
                      placeholder="Optional note for the patient"
                      className="mt-2 h-9 w-full rounded-lg border border-border bg-card px-3 text-xs focus:outline-none"
                    />
                  ) : null}
                </div>
              ))
            )}
          </div>

          {error ? <p className="mt-3 text-sm font-semibold text-destructive">{error}</p> : null}

          <ActionButton variant="primary" size="md" className="mt-5 w-full" disabled={saving} onClick={handleSubmitReview}>
            {saving ? "Submitting…" : "Submit review"}
          </ActionButton>
        </div>
      </div>
    </LabLayout>
  );
}
