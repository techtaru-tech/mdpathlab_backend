import { useEffect, useState } from "react";
import { adminCommunicationApi, type BookingCharges, type MessageTemplateRow, type SmsTemplateRow } from "@/lib/admin-api";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { cn } from "@/lib/utils";

const inputClass = "w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm focus:outline-none";

/** Admin → Settings → Charges & reminders: additional collection charge, Go Green printing charge, reminder time. */
export function BookingChargesPanel() {
  const [form, setForm] = useState<BookingCharges | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    adminCommunicationApi
      .charges()
      .then(setForm)
      .catch((err) => setMessage({ ok: false, text: err instanceof Error ? err.message : "Couldn't load these settings" }));
  }, []);

  async function save() {
    if (!form) return;
    setSaving(true);
    setMessage(null);
    try {
      setForm(await adminCommunicationApi.saveCharges(form));
      setMessage({ ok: true, text: "Saved. New bookings use these amounts." });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Couldn't save" });
    } finally {
      setSaving(false);
    }
  }

  if (!form) return message ? <p className="mt-6 text-sm font-semibold text-destructive">{message.text}</p> : <div className="mt-6 h-40 animate-pulse rounded-2xl bg-muted" />;

  const num = (key: keyof BookingCharges) => ({
    value: Number.isFinite(form[key]) ? String(form[key]) : "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: Number(e.target.value) }),
  });

  return (
    <div className="mt-6 grid gap-5 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div>
        <h3 className="text-sm font-extrabold">Additional collection charge</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Home collections farther than this distance from the lab (straight line from the lab's map pin to the patient's address pin) pay the
          extra charge. It shows as a separate line on the checkout and the bill. Set each lab's map pin in Admin → Labs.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold">
            Free distance (km)
            <input type="number" min={0} step={0.5} className={cn(inputClass, "mt-1")} {...num("farCollectionKm")} />
          </label>
          <label className="text-xs font-bold">
            Extra charge beyond it (₹)
            <input type="number" min={0} className={cn(inputClass, "mt-1")} {...num("farCollectionCharge")} />
          </label>
        </div>
      </div>
      <div>
        <h3 className="text-sm font-extrabold">Go Green — printing charge</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Reports are digital by default. A patient who asks for printed reports at checkout pays this amount (shown to them before they confirm).
        </p>
        <label className="mt-3 block text-xs font-bold sm:w-1/2">
          Printing charge per booking (₹)
          <input type="number" min={0} className={cn(inputClass, "mt-1")} {...num("printingCharge")} />
        </label>
      </div>
      <div>
        <h3 className="text-sm font-extrabold">Appointment reminder</h3>
        <p className="mt-1 text-xs text-muted-foreground">The patient gets a reminder this many hours before their slot starts. 0 turns reminders off.</p>
        <label className="mt-3 block text-xs font-bold sm:w-1/2">
          Hours before the slot
          <input type="number" min={0} max={48} step={0.5} className={cn(inputClass, "mt-1")} {...num("reminderHoursBefore")} />
        </label>
      </div>
      {message ? <p className={message.ok ? "text-xs font-semibold text-success" : "text-xs font-semibold text-destructive"}>{message.text}</p> : null}
      <div>
        <ActionButton type="button" variant="primary" size="sm" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save charges & reminders"}
        </ActionButton>
      </div>
    </div>
  );
}

/** Admin → Settings → Messages: the patient's push / in-app texts (editable) and the SMS texts (fixed by DLT). */
export function MessageTemplatesPanel() {
  const [rows, setRows] = useState<MessageTemplateRow[] | null>(null);
  const [sms, setSms] = useState<SmsTemplateRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { title: string; body: string; enabled: boolean }>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ key: string; ok: boolean; text: string } | null>(null);

  function apply(r: { templates: MessageTemplateRow[]; sms: SmsTemplateRow[] }) {
    setRows(r.templates);
    setSms(r.sms);
    setDrafts(Object.fromEntries(r.templates.map((t) => [t.key, { ...t.current }])));
  }

  useEffect(() => {
    adminCommunicationApi
      .templates()
      .then(apply)
      .catch((err) => setMessage({ key: "", ok: false, text: err instanceof Error ? err.message : "Couldn't load the messages" }));
  }, []);

  async function save(key: string, value: { title: string; body: string; enabled: boolean } | null) {
    setSavingKey(key);
    setMessage(null);
    try {
      apply(await adminCommunicationApi.saveTemplates({ [key]: value }));
      setMessage({ key, ok: true, text: value ? "Saved." : "Back to the default text." });
    } catch (err) {
      setMessage({ key, ok: false, text: err instanceof Error ? err.message : "Couldn't save" });
    } finally {
      setSavingKey(null);
    }
  }

  if (!rows) return message ? <p className="mt-6 text-sm font-semibold text-destructive">{message.text}</p> : <div className="mt-6 h-40 animate-pulse rounded-2xl bg-muted" />;

  return (
    <div className="mt-6 space-y-5">
      <p className="text-xs text-muted-foreground">
        These are the app / website notifications patients get. Words in {"{curly brackets}"} are filled in automatically — e.g. {"{orderNumber}"},{" "}
        {"{date}"}, {"{slot}"}. Switch a message off to stop sending it.
      </p>
      {rows.map((t) => {
        const d = drafts[t.key] ?? t.current;
        const changed = d.title !== t.current.title || d.body !== t.current.body || d.enabled !== t.current.enabled;
        return (
          <div key={t.key} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-extrabold">
                  {t.label} {t.customised ? <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">EDITED</span> : null}
                </h3>
                <p className="text-xs text-muted-foreground">{t.when}</p>
              </div>
              <label className="flex items-center gap-2 text-xs font-bold">
                <input
                  type="checkbox"
                  checked={d.enabled}
                  onChange={(e) => setDrafts({ ...drafts, [t.key]: { ...d, enabled: e.target.checked } })}
                  className="h-4 w-4 accent-primary"
                />
                Send
              </label>
            </div>
            <label className="mt-3 block text-xs font-bold">
              Title
              <input maxLength={120} className={cn(inputClass, "mt-1")} value={d.title} onChange={(e) => setDrafts({ ...drafts, [t.key]: { ...d, title: e.target.value } })} />
            </label>
            <label className="mt-3 block text-xs font-bold">
              Message
              <textarea
                rows={3}
                maxLength={600}
                className={cn(inputClass, "mt-1")}
                value={d.body}
                onChange={(e) => setDrafts({ ...drafts, [t.key]: { ...d, body: e.target.value } })}
              />
            </label>
            <p className="mt-1 text-[11px] text-muted-foreground">Can use: {t.placeholders.map((p) => `{${p}}`).join(" ")}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <ActionButton type="button" variant="primary" size="sm" disabled={!changed || savingKey === t.key} onClick={() => save(t.key, d)}>
                {savingKey === t.key ? "Saving…" : "Save"}
              </ActionButton>
              {t.customised ? (
                <ActionButton type="button" variant="outline" size="sm" disabled={savingKey === t.key} onClick={() => save(t.key, null)}>
                  Use default text
                </ActionButton>
              ) : null}
              {message?.key === t.key ? <span className={message.ok ? "text-xs font-semibold text-success" : "text-xs font-semibold text-destructive"}>{message.text}</span> : null}
            </div>
          </div>
        );
      })}

      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h3 className="text-sm font-extrabold">SMS texts (fixed by DLT)</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          SMS text must match the DLT-approved template exactly, so it can't be edited here. A template marked "Waiting for DLT" starts sending as
          soon as its DLT Content ID is added on the server.
        </p>
        <div className="mt-3 space-y-2">
          {sms.map((s) => (
            <div key={s.kind} className="rounded-xl bg-muted p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">{s.kind}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", s.live ? "bg-success/15 text-success" : "bg-warning/20 text-foreground")}>
                  {s.live ? "LIVE" : "WAITING FOR DLT"}
                </span>
              </div>
              <p className="mt-1 text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
