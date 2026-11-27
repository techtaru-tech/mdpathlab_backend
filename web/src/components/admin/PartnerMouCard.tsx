import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, FileText, Upload, XCircle } from "lucide-react";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { useConfirm } from "@/components/ui-kit/ConfirmDialog";
import { apiFileUrl } from "@/lib/api";
import { adminPayoutsApi, type PartnerMous } from "@/lib/admin-payouts-api";
import { MOU_STATUS_LABELS, type MouSignatureStatus, type PartnerMou } from "@/lib/partner-api";
import { cn } from "@/lib/utils";

const inputClass = "h-10 w-full rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none";
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
const todayIst = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const validPercent = (v: string) => /^\d{1,2}(\.\d{1,2})?$/.test(v) && Number(v) <= 50;
const rates = (m: PartnerMou) => `Routine ${m.routinePercent}% · Special ${m.specialPercent}% · Package ${m.packagePercent}%`;

const STATUS_TONE: Record<MouSignatureStatus, string> = {
  AWAITING_SIGNATURE: "bg-warning/15 text-warning",
  SIGNED_UPLOADED: "bg-primary/10 text-primary",
  VERIFIED: "bg-success/15 text-success",
  REJECTED: "bg-destructive/10 text-destructive",
};

function StatusPill({ m }: { m: PartnerMou }) {
  if (m.withdrawnAt) return <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">Withdrawn</span>;
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", STATUS_TONE[m.signatureStatus])}>{MOU_STATUS_LABELS[m.signatureStatus]}</span>;
}

/**
 * Admin → partner page: the partner's commission MOU. Saving the rates generates the MOU document; the partner
 * downloads it, signs and uploads it (or admin uploads a copy received on paper); admin verifies it — only then do
 * the rates apply. A verified MOU is never edited: a new MOU replaces it.
 */
export function PartnerMouCard({ partnerId }: { partnerId: string }) {
  const [data, setData] = useState<PartnerMous | null>(null);
  const [form, setForm] = useState({ routine: "", special: "", pkg: "", effectiveFrom: todayIst(), note: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  useEffect(() => {
    adminPayoutsApi
      .mous(partnerId)
      .then((d) => {
        setData(d);
        const m = d.current ?? d.pending;
        if (m) setForm((f) => ({ ...f, routine: String(m.routinePercent), special: String(m.specialPercent), pkg: String(m.packagePercent) }));
      })
      .catch((err) => setMessage({ ok: false, text: err instanceof Error ? err.message : "Couldn't load the MOU" }));
  }, [partnerId]);

  const valid = validPercent(form.routine) && validPercent(form.special) && validPercent(form.pkg) && Boolean(form.effectiveFrom) && form.effectiveFrom >= todayIst();
  const act = async (fn: () => Promise<PartnerMous>, done: string) => {
    setMessage(null);
    try {
      setData(await fn());
      setMessage({ ok: true, text: done });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Something went wrong" });
    }
  };

  async function save() {
    if (!valid) {
      setMessage({ ok: false, text: "Enter all three rates (0–50%) and a start date of today or later" });
      return;
    }
    const ok = await confirm({
      title: "Create this MOU?",
      description: (
        <>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {[
              ["Routine", form.routine],
              ["Special", form.special],
              ["Package", form.pkg],
            ].map(([label, rate]) => (
              <div key={label} className="rounded-xl border border-border bg-muted/50 p-2.5 text-center">
                <p className="text-xl font-extrabold text-primary">{rate}%</p>
                <p className="text-[11px] font-semibold">{label}</p>
              </div>
            ))}
          </div>
          <p className="mt-3">
            From <b className="text-foreground">{fmtDate(form.effectiveFrom)}</b>. The MOU document is generated and the partner is asked to sign and upload it.
            The rates apply once you verify the signed copy.
          </p>
        </>
      ),
      confirmLabel: "Create MOU",
    });
    if (!ok) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await adminPayoutsApi.createMou(partnerId, {
        routinePercent: Number(form.routine),
        specialPercent: Number(form.special),
        packagePercent: Number(form.pkg),
        effectiveFrom: form.effectiveFrom,
        ...(form.note.trim() ? { note: form.note.trim() } : {}),
      });
      setData(r);
      setForm((f) => ({ ...f, note: "" }));
      setMessage({ ok: true, text: `MOU ${r.mou.mouNumber ?? ""} created. The partner has been asked to download, sign and upload it.` });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Couldn't create the MOU" });
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(m: PartnerMou) {
    const ok = await confirm({
      title: "Withdraw this MOU?",
      description: `${m.mouNumber ?? ""} — ${rates(m)}. It will never apply.`,
      confirmLabel: "Withdraw",
      tone: "danger",
    });
    if (ok) await act(() => adminPayoutsApi.withdrawMou(partnerId, m.id), "MOU withdrawn");
  }

  async function verify(m: PartnerMou) {
    const ok = await confirm({
      title: "Verify the signed MOU?",
      description: `Check that the partner signed it (and the details match). ${rates(m)} will then apply to bookings from ${fmtDate(m.effectiveFrom > new Date().toISOString() ? m.effectiveFrom : new Date().toISOString())}.`,
      confirmLabel: "Verify — rates apply",
    });
    if (ok) await act(() => adminPayoutsApi.verifyMou(partnerId, m.id), "MOU verified — the rates now apply and the partner has been told.");
  }

  if (!data) return message ? <p className="text-sm font-semibold text-destructive">{message.text}</p> : <div className="h-24 animate-pulse rounded-xl bg-muted" />;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: k === "effectiveFrom" || k === "note" ? e.target.value : e.target.value.replace(/[^\d.]/g, "") }));

  return (
    <div className="space-y-5">
      {confirmDialog}
      {data.current ? (
        <div className="rounded-xl border border-success/30 bg-success/5 p-4">
          <p className="text-xs font-bold text-success uppercase">
            In force {data.current.mouNumber ? `· ${data.current.mouNumber}` : ""} · since {fmtDate(data.current.startsAt)}
          </p>
          <p className="mt-1 text-lg font-extrabold">{rates(data.current)}</p>
        </div>
      ) : (
        <p className="rounded-xl bg-warning/10 px-4 py-3 text-sm font-semibold text-warning">
          No verified MOU yet — until one is verified, this partner earns the test-wise / default rates from Admin → Payouts.
        </p>
      )}
      {data.upcoming ? (
        <p className="text-sm font-semibold">
          Next (verified): {rates(data.upcoming)} from {fmtDate(data.upcoming.startsAt)}
        </p>
      ) : null}

      {data.pending ? <PendingMou partnerId={partnerId} mou={data.pending} onAct={act} onVerify={verify} onWithdraw={withdraw} /> : null}

      <div className="rounded-xl border border-border p-4">
        <p className="text-sm font-bold">{data.current || data.pending ? "New MOU (change rates)" : "Create MOU"}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <label className="text-xs font-bold text-muted-foreground">
            Routine tests %
            <input value={form.routine} onChange={set("routine")} inputMode="decimal" placeholder="e.g. 20" className={`${inputClass} mt-1`} />
          </label>
          <label className="text-xs font-bold text-muted-foreground">
            Special tests %
            <input value={form.special} onChange={set("special")} inputMode="decimal" placeholder="e.g. 15" className={`${inputClass} mt-1`} />
          </label>
          <label className="text-xs font-bold text-muted-foreground">
            Packages %
            <input value={form.pkg} onChange={set("pkg")} inputMode="decimal" placeholder="e.g. 10" className={`${inputClass} mt-1`} />
          </label>
          <label className="text-xs font-bold text-muted-foreground">
            Starts on
            <input type="date" min={todayIst()} value={form.effectiveFrom} onChange={set("effectiveFrom")} className={`${inputClass} mt-1`} />
          </label>
        </div>
        <input value={form.note} onChange={set("note")} placeholder="Note (optional, for your records)" className={`${inputClass} mt-3`} />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <ActionButton size="sm" variant="navy" onClick={save} disabled={busy || !valid}>
            {busy ? "Creating…" : "Create MOU & send for signature"}
          </ActionButton>
          <p className="text-xs text-muted-foreground">The MOU PDF is generated with these rates and the terms from Payouts → Commission settings.</p>
        </div>
      </div>

      {message ? <p className={message.ok ? "text-sm font-semibold text-success" : "text-sm font-semibold text-destructive"}>{message.text}</p> : null}

      {data.history.length ? (
        <div>
          <p className="mb-2 text-xs font-bold text-muted-foreground uppercase">MOU history</p>
          <ul className="divide-y divide-border text-sm">
            {data.history.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className={m.withdrawnAt ? "text-muted-foreground" : ""}>
                  <p className="font-semibold">
                    {m.mouNumber ?? "MOU"} · {m.routinePercent}% / {m.specialPercent}% / {m.packagePercent}%{" "}
                    <span className="font-normal text-muted-foreground">from {fmtDate(m.effectiveFrom)}</span>
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <StatusPill m={m} />
                    <span>created {fmtDate(m.createdAt)}</span>
                    {m.verifiedAt ? <span>· verified {fmtDate(m.verifiedAt)}</span> : null}
                    {m.note ? <span>· {m.note}</span> : null}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs font-bold">
                  <button type="button" onClick={() => adminPayoutsApi.downloadMou(partnerId, m).catch(() => {})} className="inline-flex items-center gap-1 text-foreground/80 hover:underline">
                    <Download className="h-3.5 w-3.5" /> MOU
                  </button>
                  {m.documentUrl ? (
                    <a href={apiFileUrl(m.documentUrl)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                      <FileText className="h-3.5 w-3.5" /> Signed copy
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function PendingMou({
  partnerId,
  mou,
  onAct,
  onVerify,
  onWithdraw,
}: {
  partnerId: string;
  mou: PartnerMou;
  onAct: (fn: () => Promise<PartnerMous>, done: string) => Promise<void>;
  onVerify: (m: PartnerMou) => void;
  onWithdraw: (m: PartnerMou) => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const s = mou.signatureStatus;

  return (
    <div className="rounded-xl border border-primary/30 bg-primary-soft/40 p-4">
      <input
        ref={file}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onAct(() => adminPayoutsApi.uploadMouDocument(partnerId, mou.id, f), "Signed copy uploaded — check it and Verify.");
          e.target.value = "";
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold text-primary uppercase">{mou.mouNumber ?? "New MOU"} · not in force yet</p>
        <StatusPill m={mou} />
      </div>
      <p className="mt-1 font-extrabold">
        {rates(mou)} <span className="text-sm font-semibold text-muted-foreground">from {fmtDate(mou.effectiveFrom)}</span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {s === "AWAITING_SIGNATURE"
          ? "Waiting for the partner to download, sign and upload it (they were emailed and see it in their portal)."
          : s === "REJECTED"
            ? `Sent back: ${mou.rejectionReason ?? ""}. Waiting for the partner to upload again.`
            : `Signed copy uploaded ${fmtDate(mou.signedUploadedAt)} by ${mou.signedUploadedBy === "ADMIN" ? "admin" : "the partner"} — open it, check the signature, then Verify or Send back.`}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ActionButton size="sm" variant="outline" onClick={() => adminPayoutsApi.downloadMou(partnerId, mou).catch(() => {})}>
          <Download className="h-4 w-4" /> MOU PDF
        </ActionButton>
        {mou.documentUrl ? (
          <a href={apiFileUrl(mou.documentUrl)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
            <FileText className="h-3.5 w-3.5" /> Open signed copy
          </a>
        ) : null}
        {s === "SIGNED_UPLOADED" ? (
          <>
            <ActionButton size="sm" variant="navy" onClick={() => onVerify(mou)}>
              <CheckCircle2 className="h-4 w-4" /> Verify
            </ActionButton>
            <ActionButton size="sm" variant="outline" onClick={() => setRejecting((x) => !x)}>
              <XCircle className="h-4 w-4" /> Send back
            </ActionButton>
          </>
        ) : null}
        <button type="button" onClick={() => file.current?.click()} className="inline-flex items-center gap-1 text-xs font-bold text-foreground/80 hover:underline">
          <Upload className="h-3.5 w-3.5" /> Upload signed copy (received offline)
        </button>
        <button type="button" onClick={() => onWithdraw(mou)} className="text-xs font-bold text-destructive hover:underline">
          Withdraw
        </button>
      </div>

      {rejecting ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why? e.g. Not signed on page 2 / photo not clear (shown to the partner)"
            className={`${inputClass} min-w-[16rem] flex-1 bg-card`}
          />
          <ActionButton
            size="sm"
            variant="outline"
            disabled={reason.trim().length < 3}
            onClick={async () => {
              await onAct(() => adminPayoutsApi.rejectMou(partnerId, mou.id, reason.trim()), "Sent back — the partner has been asked to upload again.");
              setRejecting(false);
              setReason("");
            }}
          >
            Send back
          </ActionButton>
        </div>
      ) : null}
    </div>
  );
}
