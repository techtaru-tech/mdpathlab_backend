import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Banknote, Wallet } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { TableEmptyState, TableLoadingState, TableShell, Td, Th } from "@/components/admin/AdminTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import {
  adminPayoutsApi,
  type AdminBalanceRow,
  type AdminPartnerLedger,
  type AdminWithdrawalDetail,
  type AdminWithdrawalRow,
  type CommissionSettings,
  type RateItemType,
} from "@/lib/admin-payouts-api";
import { COMMISSION_ENTRY_LABELS, WITHDRAWAL_STATUS_LABELS, WITHDRAWAL_STATUS_TONES, formatPaise, type WithdrawalStatus } from "@/lib/partner-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/payouts")({
  head: () => ({ meta: [{ title: "Payouts — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminPayoutsPage,
});

const inputClass = "h-10 w-full rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none";
const errorText = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);
const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—");

const TABS = [
  { key: "withdrawals", label: "Withdrawal requests" },
  { key: "balances", label: "Partner balances" },
  { key: "rates", label: "Test-wise rates" },
  { key: "settings", label: "Commission settings" },
] as const;

function AdminPayoutsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("withdrawals");
  return (
    <AdminLayout activePath="/admin/payouts">
      <AdminPageHeader title="Payouts" description="Doctor & clinic earnings, withdrawal requests and commission settings. Transfers are made from the bank; record the UTR here." />
      <div className="mt-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-semibold",
              tab === t.key ? "border-primary bg-primary-soft text-primary" : "border-border bg-card text-foreground/75 hover:bg-muted",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-5">
        {tab === "withdrawals" ? <WithdrawalsTab /> : null}
        {tab === "balances" ? <BalancesTab /> : null}
        {tab === "rates" ? <RatesTab /> : null}
        {tab === "settings" ? <SettingsTab /> : null}
      </div>
    </AdminLayout>
  );
}

// ---------------------------------------------------------------- withdrawals

const STATUS_FILTERS: (WithdrawalStatus | undefined)[] = ["REQUESTED", "APPROVED", "PAID", "REJECTED", "CANCELLED", undefined];

function WithdrawalsTab() {
  const [status, setStatus] = useState<WithdrawalStatus | undefined>("REQUESTED");
  const [rows, setRows] = useState<AdminWithdrawalRow[]>([]);
  const [counts, setCounts] = useState<Partial<Record<WithdrawalStatus, number>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError("");
    return adminPayoutsApi
      .withdrawals(status)
      .then((r) => {
        setRows(r.items);
        setCounts(r.counts);
      })
      .catch((err) => setError(errorText(err, "Couldn't load withdrawals")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s ?? "all"}
            type="button"
            onClick={() => {
              setStatus(s);
              setOpenId(null);
            }}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-bold",
              status === s ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground/75 hover:bg-muted",
            )}
          >
            {s ? WITHDRAWAL_STATUS_LABELS[s] : "All"}
            {s && counts[s] ? ` (${counts[s]})` : ""}
          </button>
        ))}
      </div>
      {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
      <TableShell>
        <thead>
          <tr>
            <Th>Partner</Th>
            <Th>Amount</Th>
            <Th>To transfer</Th>
            <Th>Account</Th>
            <Th>Requested</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <TableLoadingState colSpan={6} />
          ) : rows.length === 0 ? (
            <TableEmptyState icon={Banknote} message="No withdrawals here." colSpan={6} />
          ) : (
            rows.map((w) => (
              <tr key={w.id} className={cn("cursor-pointer transition-colors hover:bg-muted/40", openId === w.id && "bg-primary-soft/40")} onClick={() => setOpenId(openId === w.id ? null : w.id)}>
                <Td className="font-semibold whitespace-nowrap">
                  {w.partner.displayName ?? "—"} <span className="text-xs text-muted-foreground">({w.partner.type === "DOCTOR" ? "Doctor" : "Clinic"})</span>
                </Td>
                <Td className="font-bold whitespace-nowrap">{formatPaise(w.amountPaise)}</Td>
                <Td className="whitespace-nowrap">{formatPaise(w.netPaise)}</Td>
                <Td className="whitespace-nowrap text-muted-foreground">
                  ••{w.accountLast4} · {w.ifsc}
                </Td>
                <Td className="whitespace-nowrap text-muted-foreground">{formatDate(w.createdAt)}</Td>
                <Td>
                  <StatusBadge tone={WITHDRAWAL_STATUS_TONES[w.status]}>{WITHDRAWAL_STATUS_LABELS[w.status]}</StatusBadge>
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </TableShell>
      {openId ? <WithdrawalDetail id={openId} onChanged={load} /> : null}
    </div>
  );
}

function WithdrawalDetail({ id, onChanged }: { id: string; onChanged: () => Promise<unknown> }) {
  const [w, setW] = useState<AdminWithdrawalDetail | null>(null);
  const [reason, setReason] = useState("");
  const [utr, setUtr] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setW(null);
    setMessage(null);
    adminPayoutsApi
      .withdrawal(id)
      .then(setW)
      .catch((err) => setMessage({ ok: false, text: errorText(err, "Couldn't load the withdrawal") }));
  }, [id]);

  async function act(fn: () => Promise<AdminWithdrawalDetail>, done: string) {
    setBusy(true);
    setMessage(null);
    try {
      setW(await fn());
      setMessage({ ok: true, text: done });
      setReason("");
      setUtr("");
      await onChanged();
    } catch (err) {
      setMessage({ ok: false, text: errorText(err, "Couldn't update the withdrawal") });
    } finally {
      setBusy(false);
    }
  }

  if (!w) return message ? <p className="text-sm font-semibold text-destructive">{message.text}</p> : <div className="h-40 animate-pulse rounded-2xl bg-muted" />;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-1.5 text-sm">
          <h3 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Transfer details</h3>
          <Row label="Pay to" value={w.accountHolderName} />
          <Row label="Account number" value={w.accountNumber ?? `••${w.accountLast4} (ask the partner to re-enter it)`} mono />
          <Row label="IFSC" value={w.ifsc} mono />
          <Row label="Amount requested" value={formatPaise(w.amountPaise)} />
          {w.tdsPaise > 0 ? <Row label="TDS deducted" value={formatPaise(w.tdsPaise)} /> : null}
          <Row label="Amount to transfer" value={formatPaise(w.netPaise)} strong />
          {w.utr ? <Row label="UTR" value={w.utr} mono /> : null}
          {w.adminNote ? <Row label="Note" value={w.adminNote} /> : null}
          <p className="pt-1 text-[11px] text-muted-foreground">Viewing these details is recorded in the audit log.</p>
        </div>
        <div className="space-y-1.5 text-sm">
          <h3 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Partner</h3>
          <Row label="Name" value={`${w.partner.displayName ?? "—"} (${w.partner.type === "DOCTOR" ? "Doctor" : "Clinic"})`} />
          <Row label="Mobile" value={w.partner.phone} />
          <Row label="Account status" value={w.partner.status} />
          <Row label="Balance now" value={formatPaise(w.partnerTotals.balancePaise)} />
          <Row label="Earned / reversed" value={`${formatPaise(w.partnerTotals.earnedPaise)} / ${formatPaise(w.partnerTotals.reversedPaise)}`} />
        </div>
      </div>

      {w.status === "REQUESTED" || w.status === "APPROVED" ? (
        <div className="mt-5 space-y-3 border-t border-border pt-4">
          {w.partner.status !== "APPROVED" ? (
            <p className="flex items-center gap-2 text-xs font-semibold text-warning">
              <AlertTriangle className="h-4 w-4" /> This partner is {w.partner.status.toLowerCase()} — check before paying.
            </p>
          ) : null}
          {w.status === "REQUESTED" ? (
            <ActionButton size="sm" variant="navy" disabled={busy} onClick={() => act(() => adminPayoutsApi.approve(w.id), "Approved — now make the transfer and record the UTR")}>
              Approve
            </ActionButton>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <input value={utr} onChange={(e) => setUtr(e.target.value.toUpperCase())} placeholder="Bank reference (UTR) after transferring" className={`${inputClass} max-w-xs`} />
              <ActionButton size="sm" disabled={busy || utr.trim().length < 6} onClick={() => act(() => adminPayoutsApi.markPaid(w.id, utr.trim()), "Marked as paid — the partner has been emailed")}>
                Mark as paid
              </ActionButton>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for not processing (shown to the partner)" className={`${inputClass} max-w-md`} />
            <ActionButton size="sm" variant="outline" disabled={busy || reason.trim().length < 3} onClick={() => act(() => adminPayoutsApi.reject(w.id, reason.trim()), "Not processed — the amount is back in the partner's balance")}>
              Don't process
            </ActionButton>
          </div>
        </div>
      ) : null}
      {message ? <p className={message.ok ? "mt-3 text-sm font-semibold text-success" : "mt-3 text-sm font-semibold text-destructive"}>{message.text}</p> : null}
    </div>
  );
}

function Row({ label, value, mono, strong }: { label: string; value: string; mono?: boolean; strong?: boolean }) {
  return (
    <p className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("text-right", mono && "font-mono", strong ? "font-extrabold" : "font-semibold")}>{value}</span>
    </p>
  );
}

// ---------------------------------------------------------------- balances

function BalancesTab() {
  const [rows, setRows] = useState<AdminBalanceRow[] | null>(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = () =>
    adminPayoutsApi
      .balances()
      .then(setRows)
      .catch((err) => setError(errorText(err, "Couldn't load balances")));

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
      <TableShell>
        <thead>
          <tr>
            <Th>Partner</Th>
            <Th>Balance</Th>
            <Th>On hold</Th>
            <Th>Available</Th>
            <Th>Paid out</Th>
          </tr>
        </thead>
        <tbody>
          {rows === null ? (
            <TableLoadingState colSpan={5} />
          ) : rows.length === 0 ? (
            <TableEmptyState icon={Wallet} message="No earnings yet." colSpan={5} />
          ) : (
            rows.map((r) => (
              <tr key={r.partner.id} className={cn("cursor-pointer transition-colors hover:bg-muted/40", openId === r.partner.id && "bg-primary-soft/40")} onClick={() => setOpenId(openId === r.partner.id ? null : r.partner.id)}>
                <Td className="font-semibold whitespace-nowrap">
                  {r.partner.displayName ?? "—"} <span className="text-xs text-muted-foreground">({r.partner.type === "DOCTOR" ? "Doctor" : "Clinic"})</span>
                </Td>
                <Td className="font-bold">{formatPaise(r.balancePaise)}</Td>
                <Td>{formatPaise(r.pendingPaise)}</Td>
                <Td className={r.availablePaise < 0 ? "text-destructive" : ""}>{formatPaise(r.availablePaise)}</Td>
                <Td>{formatPaise(r.paidOutPaise)}</Td>
              </tr>
            ))
          )}
        </tbody>
      </TableShell>
      {openId ? <PartnerLedger partnerId={openId} onChanged={load} /> : null}
    </div>
  );
}

function PartnerLedger({ partnerId, onChanged }: { partnerId: string; onChanged: () => Promise<unknown> }) {
  const [ledger, setLedger] = useState<AdminPartnerLedger | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setLedger(null);
    adminPayoutsApi.ledger(partnerId).then(setLedger).catch((err) => setMessage({ ok: false, text: errorText(err, "Couldn't load") }));
  }, [partnerId]);

  async function adjust() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value === 0 || reason.trim().length < 3) {
      setMessage({ ok: false, text: "Enter a non-zero amount (negative to deduct) and a reason" });
      return;
    }
    setMessage(null);
    try {
      setLedger(await adminPayoutsApi.adjust(partnerId, value, reason.trim()));
      setAmount("");
      setReason("");
      setMessage({ ok: true, text: "Adjustment recorded" });
      await onChanged();
    } catch (err) {
      setMessage({ ok: false, text: errorText(err, "Couldn't record the adjustment") });
    }
  }

  if (!ledger) return <div className="h-40 animate-pulse rounded-2xl bg-muted" />;
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-extrabold">{ledger.partner.displayName}</h3>
        <p className="text-xs text-muted-foreground">
          {ledger.bankAccount ? `Bank: ${ledger.bankAccount.accountHolderName} · ••${ledger.bankAccount.accountLast4} · ${ledger.bankAccount.ifsc}` : "No bank account added"}
        </p>
      </div>
      <ul className="mt-3 max-h-80 divide-y divide-border overflow-y-auto">
        {ledger.entries.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <div className="min-w-0">
              <p className="font-semibold">
                {COMMISSION_ENTRY_LABELS[e.type]}
                {e.order ? <span className="text-muted-foreground"> · {e.order.orderNumber}</span> : null}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {formatDate(e.createdAt)}
                {e.note ? ` · ${e.note}` : ""}
              </p>
              {e.breakdown?.length ? (
                <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                  {e.breakdown.map((l, i) => (
                    <li key={i}>
                      {l.name}: ₹{l.priceRupees.toLocaleString("en-IN")}
                      {l.discountRupees ? ` − ₹${l.discountRupees} discount` : ""} × {l.ratePercent}% = {formatPaise(l.amountPaise)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <p className={e.amountPaise < 0 ? "shrink-0 font-bold text-destructive" : "shrink-0 font-bold text-success"}>{formatPaise(e.amountPaise)}</p>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Adjustment ₹ (e.g. 250 or -250)" className={`${inputClass} w-56`} />
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (audited, shown to the partner)" className={`${inputClass} min-w-[16rem] flex-1`} />
        <ActionButton size="sm" variant="outline" onClick={adjust}>
          Record adjustment
        </ActionButton>
      </div>
      {message ? <p className={message.ok ? "mt-2 text-sm font-semibold text-success" : "mt-2 text-sm font-semibold text-destructive"}>{message.text}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------- test-wise rates

const RATE_TYPES: { key: RateItemType; label: string }[] = [
  { key: "PARAMETER", label: "Tests" },
  { key: "PROFILE", label: "Profiles" },
  { key: "PACKAGE", label: "Packages" },
  { key: "RADIOLOGY", label: "Radiology" },
];

function RatesTab() {
  const [type, setType] = useState<RateItemType>("PARAMETER");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Awaited<ReturnType<typeof adminPayoutsApi.rates>> | null>(null);
  // Unsaved edits, keyed by item id: "" = clear (use default), otherwise the typed %.
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = () =>
    adminPayoutsApi
      .rates(type, query, page)
      .then(setData)
      .catch((err) => setMessage({ ok: false, text: errorText(err, "Couldn't load the rates") }));

  useEffect(() => {
    setData(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, query, page]);

  const dirty = Object.keys(edits).length;
  const invalid = Object.values(edits).some((v) => v !== "" && !(Number(v) >= 0 && Number(v) <= 50 && /^\d+(\.\d{1,2})?$/.test(v)));

  async function save() {
    if (!data || invalid) return;
    setBusy(true);
    setMessage(null);
    try {
      const changes = Object.entries(edits).map(([itemId, v]) => ({ itemType: type, itemId, ratePercent: v === "" ? null : Number(v) }));
      const r = await adminPayoutsApi.setRates(changes);
      setEdits({});
      setMessage({ ok: true, text: `Saved ${r.updated} rate(s). New bookings use them; earlier bookings keep the rate they were booked at.` });
      await load();
    } catch (err) {
      setMessage({ ok: false, text: errorText(err, "Couldn't save the rates") });
    } finally {
      setBusy(false);
    }
  }

  const switchType = (t: RateItemType) => {
    if (dirty && !window.confirm("You have unsaved changes. Discard them?")) return;
    setEdits({});
    setType(t);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Set the commission for each test. A booking earns each test's rate on its price (after its share of any discount). Tests left blank use the
        default rate{data ? ` (${data.defaultRatePercent}%)` : ""} from Commission settings.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {RATE_TYPES.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => switchType(t.key)}
            className={cn("rounded-lg border px-3 py-1.5 text-xs font-bold", type === t.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground/75 hover:bg-muted")}
          >
            {t.label}
          </button>
        ))}
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or code" className={`${inputClass} ml-auto w-64`} />
      </div>

      <TableShell>
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Code</Th>
            <Th>Price</Th>
            <Th>Commission %</Th>
            <Th>Doctor gets</Th>
          </tr>
        </thead>
        <tbody>
          {data === null ? (
            <TableLoadingState colSpan={5} />
          ) : data.items.length === 0 ? (
            <TableEmptyState icon={Wallet} message="Nothing found." colSpan={5} />
          ) : (
            data.items.map((r) => {
              const shown = edits[r.itemId] ?? (r.ratePercent === null ? "" : String(r.ratePercent));
              const effective = shown === "" ? data.defaultRatePercent : Number(shown);
              const bad = shown !== "" && !(Number(shown) >= 0 && Number(shown) <= 50 && /^\d+(\.\d{1,2})?$/.test(shown));
              return (
                <tr key={r.itemId} className={cn(edits[r.itemId] !== undefined && "bg-warning/5")}>
                  <Td className="font-semibold">
                    {r.name}
                    {r.status !== "ACTIVE" ? <span className="ml-2 text-[11px] font-bold text-muted-foreground">({r.status.toLowerCase()})</span> : null}
                  </Td>
                  <Td className="font-mono text-xs text-muted-foreground">{r.code ?? "—"}</Td>
                  <Td className="whitespace-nowrap">₹{r.priceRupees.toLocaleString("en-IN")}</Td>
                  <Td>
                    <input
                      value={shown}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^\d.]/g, "");
                        setEdits((x) => {
                          const original = r.ratePercent === null ? "" : String(r.ratePercent);
                          const next = { ...x };
                          if (v === original) delete next[r.itemId];
                          else next[r.itemId] = v;
                          return next;
                        });
                      }}
                      placeholder={`default ${data.defaultRatePercent}`}
                      inputMode="decimal"
                      className={cn("h-9 w-28 rounded-lg border bg-muted px-2 text-sm focus:outline-none", bad ? "border-destructive" : "border-border")}
                    />
                  </Td>
                  <Td className="whitespace-nowrap text-muted-foreground">{bad ? "0–50%" : formatPaise(Math.floor((r.priceRupees * Math.round(effective * 100)) / 100))}</Td>
                </tr>
              );
            })
          )}
        </tbody>
      </TableShell>

      <div className="flex flex-wrap items-center gap-3">
        {data && data.total > data.pageSize ? (
          <div className="flex items-center gap-2 text-xs font-semibold">
            <button type="button" disabled={page <= 1 || dirty > 0} onClick={() => setPage(page - 1)} className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40">
              ← Prev
            </button>
            <span>
              Page {page} of {Math.ceil(data.total / data.pageSize)}
            </span>
            <button type="button" disabled={page * data.pageSize >= data.total || dirty > 0} onClick={() => setPage(page + 1)} className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40">
              Next →
            </button>
          </div>
        ) : null}
        <ActionButton size="sm" variant="navy" onClick={save} disabled={busy || dirty === 0 || invalid} className="ml-auto">
          {busy ? "Saving…" : dirty ? `Save ${dirty} change${dirty === 1 ? "" : "s"}` : "No changes"}
        </ActionButton>
      </div>
      {message ? <p className={message.ok ? "text-sm font-semibold text-success" : "text-sm font-semibold text-destructive"}>{message.text}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------- settings

function SettingsTab() {
  const [s, setS] = useState<CommissionSettings | null>(null);
  const [form, setForm] = useState({ enabled: false, ratePercent: "0", holdDays: "7", minWithdrawalRupees: "5000", tdsPercent: "0" });
  const [health, setHealth] = useState<Awaited<ReturnType<typeof adminPayoutsApi.health>> | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const fill = (x: CommissionSettings) => {
    setS(x);
    setForm({ enabled: x.enabled, ratePercent: String(x.ratePercent), holdDays: String(x.holdDays), minWithdrawalRupees: String(x.minWithdrawalRupees), tdsPercent: String(x.tdsPercent) });
  };

  useEffect(() => {
    adminPayoutsApi.settings().then(fill).catch((err) => setMessage({ ok: false, text: errorText(err, "Couldn't load settings") }));
    adminPayoutsApi.health().then(setHealth).catch(() => {});
  }, []);

  async function save() {
    if (form.enabled && !s?.enabled && !window.confirm("Switch commission ON? From now on, completed and paid bookings of referred patients will earn commission. Make sure this has legal / CA approval.")) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      fill(
        await adminPayoutsApi.updateSettings({
          enabled: form.enabled,
          ratePercent: Number(form.ratePercent),
          holdDays: Number(form.holdDays),
          minWithdrawalRupees: Number(form.minWithdrawalRupees),
          // TDS is not used: payouts are paid in full (the API still supports a rate if it is ever needed).
          tdsPercent: 0,
        }),
      );
      setMessage({ ok: true, text: "Saved." });
    } catch (err) {
      setMessage({ ok: false, text: errorText(err, "Couldn't save") });
    } finally {
      setBusy(false);
    }
  }

  if (!s) return message ? <p className="text-sm font-semibold text-destructive">{message.text}</p> : <div className="h-64 animate-pulse rounded-2xl bg-muted" />;
  const num = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="max-w-2xl space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-start gap-3 rounded-xl bg-warning/10 p-4 text-xs font-semibold text-warning">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Paying doctors for referring patients may be restricted by medical-ethics rules (NMC professional conduct regulations) and needs tax
          handling. Switch this on only after legal and CA approval.
        </p>
      </div>

      <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted px-4 py-3">
        <span>
          <span className="block text-sm font-bold">Commission</span>
          <span className="block text-xs text-muted-foreground">
            {s.enabled && s.activeSince
              ? `On since ${formatDate(s.activeSince)} — bookings placed after this earn.`
              : "Off — no commission is calculated. When switched on, only bookings placed from that moment earn."}
          </span>
        </span>
        <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} className="h-5 w-5 accent-primary" />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Default rate (%)" hint="Used for any test without its own rate in Test-wise rates. 0 = such tests earn nothing.">
          <input value={form.ratePercent} onChange={num("ratePercent")} inputMode="decimal" className={inputClass} />
        </Field>
        <Field label="Minimum withdrawal (₹)" hint="A partner can withdraw once their available balance reaches this.">
          <input value={form.minWithdrawalRupees} onChange={num("minWithdrawalRupees")} inputMode="numeric" className={inputClass} />
        </Field>
        <Field label="Hold period (days)" hint="Earnings wait this long before they can be withdrawn, so cancellations and refunds are caught.">
          <input value={form.holdDays} onChange={num("holdDays")} inputMode="numeric" className={inputClass} />
        </Field>
      </div>

      <ActionButton size="sm" variant="navy" onClick={save} disabled={busy}>
        {busy ? "Saving…" : "Save commission settings"}
      </ActionButton>
      {message ? <p className={message.ok ? "text-sm font-semibold text-success" : "text-sm font-semibold text-destructive"}>{message.text}</p> : null}

      <p className="border-t border-border pt-4 text-xs text-muted-foreground">
        Commission job: {health?.heartbeat?.lastSuccessAt ? `last ran ${formatDate(health.heartbeat.lastSuccessAt)}` : "not run yet"}
        {health?.heartbeat?.lastError ? ` · last error: ${health.heartbeat.lastError}` : ""}
        {health?.stale && health?.heartbeat ? " · not run recently" : ""}. It runs every 5 minutes. Cancelled or refunded bookings are always reversed, even while commission is off.
      </p>
      <button
        type="button"
        onClick={async () => {
          try {
            const r = await adminPayoutsApi.runNow();
            setMessage({ ok: true, text: r.skipped ? "Already running — try again in a moment." : `Done: ${r.earned} new earning(s), ${r.reversed} reversal(s).` });
            adminPayoutsApi.health().then(setHealth).catch(() => {});
          } catch (err) {
            setMessage({ ok: false, text: errorText(err, "Couldn't run it") });
          }
        }}
        className="text-xs font-bold text-primary hover:underline"
      >
        Calculate now
      </button>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-muted-foreground uppercase">{label}</span>
      {children}
      <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>
    </label>
  );
}
