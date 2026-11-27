import { useEffect, useRef, useState } from "react";
import { FileText, Upload } from "lucide-react";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { apiFileUrl } from "@/lib/api";
import { adminPayoutsApi, type PartnerMous } from "@/lib/admin-payouts-api";
import type { PartnerMou } from "@/lib/partner-api";

const inputClass = "h-10 w-full rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none";
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const todayIst = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const validPercent = (v: string) => /^\d{1,2}(\.\d{1,2})?$/.test(v) && Number(v) <= 50;

/**
 * Admin → partner page: the partner's commission MOU — Routine / Special / Package % from a start date, with the
 * signed MOU file. A new MOU replaces the old one from its start date; bookings already made keep their rates.
 */
export function PartnerMouCard({ partnerId }: { partnerId: string }) {
  const [data, setData] = useState<PartnerMous | null>(null);
  const [form, setForm] = useState({ routine: "", special: "", pkg: "", effectiveFrom: todayIst(), note: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    adminPayoutsApi
      .mous(partnerId)
      .then((d) => {
        setData(d);
        const m = d.current;
        if (m) setForm((f) => ({ ...f, routine: String(m.routinePercent), special: String(m.specialPercent), pkg: String(m.packagePercent) }));
      })
      .catch((err) => setMessage({ ok: false, text: err instanceof Error ? err.message : "Couldn't load the MOU" }));
  }, [partnerId]);

  const valid = validPercent(form.routine) && validPercent(form.special) && validPercent(form.pkg) && Boolean(form.effectiveFrom) && form.effectiveFrom >= todayIst();

  async function save() {
    if (!valid) {
      setMessage({ ok: false, text: "Enter all three rates (0–50%) and a start date of today or later" });
      return;
    }
    if (!window.confirm(`Save MOU: Routine ${form.routine}% · Special ${form.special}% · Package ${form.pkg}% from ${form.effectiveFrom}? It cannot be edited later — only replaced by a new MOU.`)) return;
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
      setMessage({ ok: true, text: "MOU saved. Upload the signed copy below." });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Couldn't save the MOU" });
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(m: PartnerMou) {
    if (!window.confirm(`Withdraw the MOU starting ${fmtDate(m.effectiveFrom)}?`)) return;
    try {
      setData(await adminPayoutsApi.withdrawMou(partnerId, m.id));
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Couldn't withdraw it" });
    }
  }

  async function upload(m: PartnerMou, file: File) {
    setMessage(null);
    try {
      setData(await adminPayoutsApi.uploadMouDocument(partnerId, m.id, file));
      setMessage({ ok: true, text: "Signed MOU uploaded" });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Couldn't upload the file" });
    }
  }

  if (!data) return message ? <p className="text-sm font-semibold text-destructive">{message.text}</p> : <div className="h-24 animate-pulse rounded-xl bg-muted" />;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: k === "effectiveFrom" || k === "note" ? e.target.value : e.target.value.replace(/[^\d.]/g, "") }));

  return (
    <div className="space-y-5">
      {data.current ? (
        <div className="rounded-xl border border-primary/30 bg-primary-soft/50 p-4">
          <p className="text-xs font-bold text-primary uppercase">In force since {fmtDate(data.current.effectiveFrom)}</p>
          <p className="mt-1 text-lg font-extrabold">
            Routine {data.current.routinePercent}% · Special {data.current.specialPercent}% · Package {data.current.packagePercent}%
          </p>
        </div>
      ) : (
        <p className="rounded-xl bg-warning/10 px-4 py-3 text-sm font-semibold text-warning">
          No MOU yet — until one is added, this partner earns the test-wise / default rates from Admin → Payouts.
        </p>
      )}
      {data.upcoming ? (
        <p className="text-sm font-semibold">
          Next: Routine {data.upcoming.routinePercent}% · Special {data.upcoming.specialPercent}% · Package {data.upcoming.packagePercent}% from{" "}
          {fmtDate(data.upcoming.effectiveFrom)}
        </p>
      ) : null}

      <div className="rounded-xl border border-border p-4">
        <p className="text-sm font-bold">{data.current ? "Change rates (new MOU)" : "Add MOU"}</p>
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
        <input value={form.note} onChange={set("note")} placeholder="Note (optional, e.g. MOU dated 20 Nov 2026)" className={`${inputClass} mt-3`} />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <ActionButton size="sm" variant="navy" onClick={save} disabled={busy || !valid}>
            {busy ? "Saving…" : "Save MOU"}
          </ActionButton>
          <p className="text-xs text-muted-foreground">Starting today = from now. Bookings already made keep the rate they were booked at.</p>
        </div>
      </div>

      {message ? <p className={message.ok ? "text-sm font-semibold text-success" : "text-sm font-semibold text-destructive"}>{message.text}</p> : null}

      {data.history.length ? (
        <div>
          <p className="mb-2 text-xs font-bold text-muted-foreground uppercase">MOU history</p>
          <ul className="divide-y divide-border text-sm">
            {data.history.map((m) => (
              <MouRow key={m.id} mou={m} onUpload={(f) => upload(m, f)} onWithdraw={() => withdraw(m)} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function MouRow({ mou, onUpload, onWithdraw }: { mou: PartnerMou; onUpload: (f: File) => void; onWithdraw: () => void }) {
  const file = useRef<HTMLInputElement>(null);
  const future = !mou.withdrawnAt && new Date(mou.effectiveFrom) > new Date();
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2.5">
      <div className={mou.withdrawnAt ? "text-muted-foreground line-through" : ""}>
        <p className="font-semibold">
          {mou.routinePercent}% / {mou.specialPercent}% / {mou.packagePercent}% <span className="font-normal text-muted-foreground">from {fmtDate(mou.effectiveFrom)}</span>
        </p>
        {mou.note ? <p className="text-xs text-muted-foreground">{mou.note}</p> : null}
      </div>
      <div className="flex items-center gap-3 text-xs font-bold">
        {mou.withdrawnAt ? <span className="text-muted-foreground">withdrawn</span> : null}
        {mou.documentUrl ? (
          <a href={apiFileUrl(mou.documentUrl)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
            <FileText className="h-3.5 w-3.5" /> Signed MOU
          </a>
        ) : null}
        {!mou.withdrawnAt ? (
          <>
            <input
              ref={file}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
                e.target.value = "";
              }}
            />
            <button type="button" onClick={() => file.current?.click()} className="inline-flex items-center gap-1 text-foreground/80 hover:underline">
              <Upload className="h-3.5 w-3.5" /> {mou.documentUrl ? "Replace file" : "Upload signed MOU"}
            </button>
          </>
        ) : null}
        {future ? (
          <button type="button" onClick={onWithdraw} className="text-destructive hover:underline">
            Withdraw
          </button>
        ) : null}
      </div>
    </li>
  );
}
