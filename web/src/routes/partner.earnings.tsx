import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Banknote, Clock, Landmark, Wallet } from "lucide-react";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { PartnerLayout, PartnerPortalClosed, usePartnerPortalEnabled } from "@/components/partner/PartnerLayout";
import {
  COMMISSION_ENTRY_LABELS,
  PartnerApiError,
  WITHDRAWAL_STATUS_LABELS,
  WITHDRAWAL_STATUS_TONES,
  formatPaise,
  partnerEarningsApi,
  type PartnerEarnings,
} from "@/lib/partner-api";

export const Route = createFileRoute("/partner/earnings")({
  head: () => ({ meta: [{ title: "Earnings — MD Path Lab" }, { name: "robots", content: "noindex" }] }),
  component: PartnerEarningsPage,
});

const inputClass = "h-11 w-full rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none disabled:opacity-60";
const errorText = (err: unknown, fallback: string) => (err instanceof PartnerApiError ? err.message : fallback);
const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");

function PartnerEarningsPage() {
  const enabled = usePartnerPortalEnabled();
  if (enabled === false) return <PartnerPortalClosed />;
  return <PartnerLayout activePath="/partner/earnings">{enabled ? <Earnings /> : null}</PartnerLayout>;
}

function Earnings() {
  const [data, setData] = useState<PartnerEarnings | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    partnerEarningsApi
      .get()
      .then(setData)
      .catch((err) => setError(errorText(err, "Couldn't load your earnings")));
  }, []);

  if (error) return <p className="max-w-xl text-sm text-destructive">{error}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const t = data.totals;
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Earnings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {data.programme.enabled
            ? `Earnings are added when a referred patient's booking is completed and paid, and can be withdrawn after ${data.programme.holdDays} day${data.programme.holdDays === 1 ? "" : "s"}. Minimum withdrawal ${formatPaise(data.programme.minWithdrawalRupees * 100)}.`
            : "The earnings programme is not active at the moment. Anything already in your balance is shown below."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat icon={Wallet} label="Available to withdraw" value={formatPaise(Math.max(0, t.availablePaise))} highlight />
        <Stat icon={Clock} label={`On hold (${data.programme.holdDays} days)`} value={formatPaise(t.pendingPaise)} />
        <Stat icon={Banknote} label="Paid out so far" value={formatPaise(t.paidOutPaise)} />
      </div>
      {t.availablePaise < 0 ? (
        <p className="rounded-xl bg-warning/10 px-4 py-3 text-xs font-semibold text-warning">
          A booking was cancelled after its commission was paid out, so {formatPaise(-t.availablePaise)} will be taken from your next earnings.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <WithdrawCard data={data} onChanged={setData} />
        <BankCard data={data} onChanged={setData} />
      </div>

      <Withdrawals data={data} onChanged={setData} />
      <Ledger data={data} />
    </div>
  );
}

function Stat({ icon: Icon, label, value, highlight }: { icon: typeof Wallet; label: string; value: string; highlight?: boolean }) {
  return (
    <div className={highlight ? "rounded-2xl border border-primary/30 bg-primary-soft p-5 shadow-sm" : "rounded-2xl border border-border bg-card p-5 shadow-sm"}>
      <Icon className="h-5 w-5 text-primary" />
      <p className="mt-2 text-2xl font-extrabold">{value}</p>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
    </div>
  );
}

function WithdrawCard({ data, onChanged }: { data: PartnerEarnings; onChanged: (d: PartnerEarnings) => void }) {
  const [amount, setAmount] = useState(String(data.maxWithdrawalRupees || ""));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const min = data.programme.minWithdrawalRupees;

  async function withdraw() {
    const rupees = Number(amount);
    if (!Number.isInteger(rupees) || rupees < min || rupees > data.maxWithdrawalRupees) {
      setMessage({ ok: false, text: `Enter a whole amount between ₹${min.toLocaleString("en-IN")} and ₹${data.maxWithdrawalRupees.toLocaleString("en-IN")}` });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      onChanged(await partnerEarningsApi.withdraw(rupees));
      setMessage({ ok: true, text: "Withdrawal requested. We'll transfer it to your bank account after review." });
    } catch (err) {
      setMessage({ ok: false, text: errorText(err, "Couldn't request the withdrawal") });
    } finally {
      setBusy(false);
    }
  }

  const tds = data.programme.tdsPercent;
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Withdraw</h2>
      {data.canWithdraw ? (
        <>
          <label className="mt-4 block">
            <span className="mb-1.5 block text-xs font-bold text-muted-foreground uppercase">Amount (₹)</span>
            <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={inputClass} />
          </label>
          <p className="mt-2 text-xs text-muted-foreground">
            Minimum ₹{min.toLocaleString("en-IN")} · up to ₹{data.maxWithdrawalRupees.toLocaleString("en-IN")}
            {tds > 0 ? ` · ${tds}% TDS is deducted` : ""} · paid to the account ending {data.bankAccount?.accountLast4}
          </p>
          <ActionButton size="sm" className="mt-4" onClick={withdraw} disabled={busy}>
            {busy ? "Requesting…" : "Request withdrawal"}
          </ActionButton>
        </>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">{data.withdrawBlockedReason}</p>
      )}
      {message ? <p className={message.ok ? "mt-3 text-sm font-semibold text-success" : "mt-3 text-sm font-semibold text-destructive"}>{message.text}</p> : null}
    </div>
  );
}

function BankCard({ data, onChanged }: { data: PartnerEarnings; onChanged: (d: PartnerEarnings) => void }) {
  const [editing, setEditing] = useState(!data.bankAccount);
  const [form, setForm] = useState({ accountHolderName: data.bankAccount?.accountHolderName ?? "", accountNumber: "", confirm: "", ifsc: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const inProgress = data.withdrawals.some((w) => w.status === "REQUESTED" || w.status === "APPROVED");

  async function save() {
    if (form.accountNumber.replace(/\s/g, "") !== form.confirm.replace(/\s/g, "")) {
      setMessage({ ok: false, text: "The two account numbers don't match" });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      onChanged(await partnerEarningsApi.saveBankAccount({ accountHolderName: form.accountHolderName, accountNumber: form.accountNumber, ifsc: form.ifsc }));
      setEditing(false);
      setForm((f) => ({ ...f, accountNumber: "", confirm: "", ifsc: "" }));
      setMessage({ ok: true, text: "Bank account saved" });
    } catch (err) {
      setMessage({ ok: false, text: errorText(err, "Couldn't save the bank account") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-extrabold tracking-wide text-muted-foreground uppercase">
        <Landmark className="h-4 w-4" /> Bank account
      </h2>
      {!editing && data.bankAccount ? (
        <div className="mt-4 space-y-1 text-sm">
          <p className="font-bold">{data.bankAccount.accountHolderName}</p>
          <p className="font-mono text-muted-foreground">XXXX XXXX {data.bankAccount.accountLast4}</p>
          <p className="font-mono text-muted-foreground">{data.bankAccount.ifsc}</p>
          {inProgress ? (
            <p className="pt-2 text-xs text-muted-foreground">You can change it once your withdrawal in progress is completed.</p>
          ) : (
            <button type="button" onClick={() => setEditing(true)} className="pt-2 text-xs font-bold text-primary hover:underline">
              Change bank account
            </button>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <input value={form.accountHolderName} onChange={set("accountHolderName")} placeholder="Account holder name" className={inputClass} />
          <input value={form.accountNumber} onChange={set("accountNumber")} placeholder="Account number" inputMode="numeric" autoComplete="off" className={inputClass} />
          <input value={form.confirm} onChange={set("confirm")} placeholder="Re-enter account number" inputMode="numeric" autoComplete="off" onPaste={(e) => e.preventDefault()} className={inputClass} />
          <input value={form.ifsc} onChange={(e) => setForm((f) => ({ ...f, ifsc: e.target.value.toUpperCase() }))} placeholder="IFSC (e.g. SBIN0001234)" maxLength={11} className={inputClass} />
          <div className="flex items-center gap-3">
            <ActionButton size="sm" variant="navy" onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save bank account"}
            </ActionButton>
            {data.bankAccount ? (
              <button type="button" onClick={() => setEditing(false)} className="text-xs font-bold text-muted-foreground hover:underline">
                Cancel
              </button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">Stored encrypted. Only the last 4 digits are ever shown. We email you whenever it changes.</p>
        </div>
      )}
      {message ? <p className={message.ok ? "mt-3 text-sm font-semibold text-success" : "mt-3 text-sm font-semibold text-destructive"}>{message.text}</p> : null}
    </div>
  );
}

function Withdrawals({ data, onChanged }: { data: PartnerEarnings; onChanged: (d: PartnerEarnings) => void }) {
  const [error, setError] = useState("");
  if (data.withdrawals.length === 0) return null;

  async function cancel(id: string) {
    setError("");
    try {
      onChanged(await partnerEarningsApi.cancelWithdrawal(id));
    } catch (err) {
      setError(errorText(err, "Couldn't cancel"));
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Withdrawals</h2>
      <ul className="divide-y divide-border">
        {data.withdrawals.map((w) => (
          <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <div>
              <p className="font-bold">
                {formatPaise(w.amountPaise)}
                {w.tdsPaise > 0 ? <span className="font-semibold text-muted-foreground"> · you receive {formatPaise(w.netPaise)} after TDS</span> : null}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDate(w.createdAt)} · account ending {w.accountLast4}
                {w.utr ? ` · UTR ${w.utr}` : ""}
                {w.status === "REJECTED" && w.adminNote ? ` · ${w.adminNote}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge tone={WITHDRAWAL_STATUS_TONES[w.status]}>{WITHDRAWAL_STATUS_LABELS[w.status]}</StatusBadge>
              {w.status === "REQUESTED" ? (
                <button type="button" onClick={() => cancel(w.id)} className="text-xs font-bold text-destructive hover:underline">
                  Cancel
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {error ? <p className="mt-2 text-sm font-semibold text-destructive">{error}</p> : null}
    </div>
  );
}

function Ledger({ data }: { data: PartnerEarnings }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-extrabold tracking-wide text-muted-foreground uppercase">History</h2>
      {data.entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing yet. Earnings appear here when a referred patient's booking is completed.</p>
      ) : (
        <ul className="divide-y divide-border">
          {data.entries.map((e) => {
            const onHold = e.type === "EARNING" && new Date(e.availableAt) > new Date();
            return (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {COMMISSION_ENTRY_LABELS[e.type]}
                    {e.orderNumber ? <span className="text-muted-foreground"> · booking {e.orderNumber}</span> : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatDate(e.createdAt)}
                    {onHold ? ` · withdrawable from ${formatDate(e.availableAt)}` : ""}
                    {e.note ? ` · ${e.note}` : ""}
                  </p>
                </div>
                <p className={e.amountPaise < 0 ? "shrink-0 font-bold text-destructive" : "shrink-0 font-bold text-success"}>
                  {e.amountPaise > 0 ? "+" : ""}
                  {formatPaise(e.amountPaise)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted-foreground">Only booking numbers are shown — never who the patient was or what they were tested for.</p>
    </div>
  );
}
