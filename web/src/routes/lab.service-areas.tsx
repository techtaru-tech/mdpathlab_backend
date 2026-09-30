import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { LabLayout } from "@/components/lab/LabLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { TableEmptyState, TableLoadingState, TableShell, Td, Th } from "@/components/admin/AdminTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { LabApiError, labServiceAreasApi, type LabServiceAreaRequest } from "@/lib/lab-api";

export const Route = createFileRoute("/lab/service-areas")({
  head: () => ({ meta: [{ title: "Service Areas — Lab Dashboard" }, { name: "robots", content: "noindex" }] }),
  component: LabServiceAreasPage,
});

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function LabServiceAreasPage() {
  const [pincodes, setPincodes] = useState<string[]>([]);
  const [requests, setRequests] = useState<LabServiceAreaRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [pincode, setPincode] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    labServiceAreasApi
      .get()
      .then((res) => {
        setPincodes(res.servicePincodes);
        setRequests(res.requests);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit() {
    setError("");
    if (!/^\d{6}$/.test(pincode)) {
      setError("Enter a valid 6-digit pincode");
      return;
    }
    setSaving(true);
    try {
      const created = await labServiceAreasApi.create({ pincode, ...(note.trim() ? { note: note.trim() } : {}) });
      setRequests((prev) => [created, ...prev]);
      setPincode("");
      setNote("");
    } catch (err) {
      setError(err instanceof LabApiError ? err.message : "Couldn't send request");
    } finally {
      setSaving(false);
    }
  }

  return (
    <LabLayout activePath="/lab/service-areas">
      <AdminPageHeader
        title="Service Areas"
        description="Pincodes your lab serves today, and requests to start serving a new one. Admin reviews each request — once approved, customers in that pincode can book with your lab."
      />

      <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-xs font-extrabold tracking-wide text-muted-foreground uppercase">Pincodes you serve</h2>
        {loading ? (
          <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
        ) : pincodes.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">None yet — request one below.</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {pincodes.map((p) => (
              <span key={p} className="rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary">
                {p}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm sm:grid-cols-[180px_1fr_auto] sm:items-start">
        <input
          value={pincode}
          onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          maxLength={6}
          placeholder="New pincode"
          className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
          placeholder="Note for admin (optional) — e.g. we have a collection point nearby"
          className="h-11 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
        />
        <ActionButton type="button" variant="primary" size="sm" onClick={handleSubmit} disabled={saving}>
          {saving ? "Sending…" : "Request pincode"}
        </ActionButton>
        {error ? <p className="text-xs font-semibold text-destructive sm:col-span-3">{error}</p> : null}
      </div>

      <div className="mt-6">
        <TableShell>
          <thead>
            <tr>
              <Th>Requested</Th>
              <Th>Pincode</Th>
              <Th>Note</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoadingState colSpan={4} />
            ) : requests.length === 0 ? (
              <TableEmptyState icon={MapPin} message="No requests sent yet." colSpan={4} />
            ) : (
              requests.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-muted/40">
                  <Td className="whitespace-nowrap text-muted-foreground">{formatDate(r.createdAt)}</Td>
                  <Td className="font-semibold whitespace-nowrap">{r.pincode}</Td>
                  <Td className="max-w-xs text-muted-foreground">{r.note ?? "—"}</Td>
                  <Td>
                    <StatusBadge tone={r.status === "PENDING" ? "warning" : r.status === "APPROVED" ? "success" : "danger"}>
                      {r.status === "PENDING" ? "Pending" : r.status === "APPROVED" ? "Approved" : "Rejected"}
                    </StatusBadge>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </TableShell>
      </div>
    </LabLayout>
  );
}
