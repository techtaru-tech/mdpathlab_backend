import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarCheck, CheckCircle2, MapPin, Package, Receipt, ShieldCheck } from "lucide-react";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { PartnerLayout, PartnerPortalClosed, usePartnerPortalEnabled } from "@/components/partner/PartnerLayout";
import { addressLine, inputClass, NewAddressForm, SlotPicker, TestPicker, todayIst, type PickedTest } from "@/components/admin/booking/BookingFormParts";
import { collectionCentresApi, type CollectionCentre } from "@/lib/api";
import {
  BOOKING_STATUS_LABELS,
  PartnerApiError,
  partnerApi,
  partnerBookingsApi,
  type PartnerBookingQuote,
  type PartnerBookingRow,
  type PartnerPatientAddress,
  type PartnerVerifiedPatient,
} from "@/lib/partner-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/partner/bookings")({
  head: () => ({ meta: [{ title: "Book for a patient — MD Path Lab" }, { name: "robots", content: "noindex" }] }),
  component: PartnerBookingsPage,
});

const errorText = (err: unknown, fallback: string) => (err instanceof PartnerApiError ? err.message : fallback);
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—");

function PartnerBookingsPage() {
  const enabled = usePartnerPortalEnabled();
  if (enabled === false) return <PartnerPortalClosed />;
  return <PartnerLayout activePath="/partner/bookings">{enabled ? <Bookings /> : null}</PartnerLayout>;
}

function Bookings() {
  const [approved, setApproved] = useState<boolean | null>(null);
  const [rows, setRows] = useState<PartnerBookingRow[] | null>(null);
  const [booking, setBooking] = useState(false);
  const [done, setDone] = useState<{ orderNumber: string; total: number } | null>(null);

  const load = () =>
    partnerBookingsApi
      .list()
      .then(setRows)
      .catch(() => setRows([]));

  useEffect(() => {
    partnerApi
      .me()
      .then((m) => setApproved(m.status === "APPROVED"))
      .catch(() => setApproved(false));
    load();
  }, []);

  if (approved === null) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Book for a patient</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Book tests for a patient who is with you. An OTP goes to the patient's mobile — they read it out to you, which confirms they agreed. The
            patient pays at sample collection and gets the usual confirmation on their phone.
          </p>
        </div>
        {approved && !booking ? (
          <ActionButton
            size="sm"
            variant="navy"
            onClick={() => {
              setDone(null);
              setBooking(true);
            }}
          >
            New booking
          </ActionButton>
        ) : null}
      </div>

      {!approved ? (
        <p className="rounded-xl bg-warning/10 px-4 py-3 text-sm font-semibold text-warning">Booking for patients opens once your account is approved.</p>
      ) : null}

      {done ? (
        <div className="flex items-start gap-3 rounded-2xl border border-success/30 bg-success/10 p-5">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
          <div>
            <p className="font-extrabold">Booking {done.orderNumber} confirmed</p>
            <p className="text-sm text-muted-foreground">
              The patient pays ₹{done.total.toLocaleString("en-IN")} at sample collection. They have been sent the booking details.
            </p>
          </div>
        </div>
      ) : null}

      {booking ? (
        <NewBooking
          onCancel={() => setBooking(false)}
          onBooked={(r) => {
            setBooking(false);
            setDone(r);
            load();
          }}
        />
      ) : null}

      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Bookings you made</h2>
        {rows === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bookings yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-bold">
                    {r.orderNumber} <span className="font-semibold text-muted-foreground">· {r.patient.name ?? "Patient"} · {r.patient.phone}</span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{r.tests.join(", ")}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.collectionType === "HOME" ? "Home collection" : "Centre visit"} · {fmtDate(r.scheduledDate)}
                    {r.slotLabel ? ` · ${r.slotLabel}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-extrabold">₹{r.total.toLocaleString("en-IN")}</p>
                  <p className={cn("text-xs font-bold", r.status === "CANCELLED" ? "text-destructive" : r.status === "REPORT_READY" ? "text-success" : "text-primary")}>
                    {BOOKING_STATUS_LABELS[r.status] ?? r.status}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted-foreground">Reports go to the patient only.</p>
      </div>
    </div>
  );
}

function Step({ n, title, icon: Icon, children }: { n: number; title: string; icon: typeof Package; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-extrabold">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-primary-soft text-xs text-primary">{n}</span>
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function PatientStep({ onVerified }: { onVerified: (p: PartnerVerifiedPatient) => void }) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    if (!/^[6-9]\d{9}$/.test(phone)) return setError("Enter the patient's 10-digit mobile number");
    setBusy(true);
    setError("");
    try {
      const r = await partnerBookingsApi.sendOtp(phone);
      setSent(r.message + (r.devCode ? ` (test code ${r.devCode})` : ""));
    } catch (err) {
      setError(errorText(err, "Couldn't send the OTP"));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!/^\d{6}$/.test(otp)) return setError("Enter the 6-digit OTP");
    setBusy(true);
    setError("");
    try {
      onVerified(await partnerBookingsApi.verify(phone, otp, name.trim() || undefined));
    } catch (err) {
      setError(errorText(err, "Couldn't verify the OTP"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold text-muted-foreground">
          Patient's mobile number *
          <input
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value.replace(/\D/g, "").slice(0, 10));
              setSent(null);
              setOtp("");
            }}
            inputMode="numeric"
            placeholder="10-digit mobile"
            className={cn(inputClass, "mt-1")}
          />
        </label>
        <label className="text-xs font-bold text-muted-foreground">
          Patient's name (for a new patient)
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className={cn(inputClass, "mt-1")} />
        </label>
      </div>
      {!sent ? (
        <ActionButton size="sm" onClick={send} disabled={busy}>
          {busy ? "Sending…" : "Send OTP to patient"}
        </ActionButton>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-success">{sent}</p>
          <div className="flex flex-wrap items-center gap-2">
            <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="6-digit OTP" className={cn(inputClass, "w-40")} />
            <ActionButton size="sm" variant="navy" onClick={verify} disabled={busy}>
              {busy ? "Checking…" : "Verify"}
            </ActionButton>
            <button type="button" onClick={send} disabled={busy} className="text-xs font-bold text-primary hover:underline">
              Resend
            </button>
          </div>
        </div>
      )}
      {error ? <p className="text-xs font-semibold text-destructive">{error}</p> : null}
    </div>
  );
}

function NewBooking({ onCancel, onBooked }: { onCancel: () => void; onBooked: (r: { orderNumber: string; total: number }) => void }) {
  const [patient, setPatient] = useState<PartnerVerifiedPatient | null>(null);
  const [addresses, setAddresses] = useState<PartnerPatientAddress[]>([]);
  const [collectionType, setCollectionType] = useState<"HOME" | "CENTER">("HOME");
  const [addressId, setAddressId] = useState("");
  const [addingAddress, setAddingAddress] = useState(false);
  const [centres, setCentres] = useState<CollectionCentre[]>([]);
  const [centreId, setCentreId] = useState("");
  const [tests, setTests] = useState<PickedTest[]>([]);
  const [date, setDate] = useState(todayIst());
  const [slotId, setSlotId] = useState("");
  const [printed, setPrinted] = useState(false);
  const [printedAgreed, setPrintedAgreed] = useState(false);
  const [consent, setConsent] = useState(false);
  const [note, setNote] = useState("");
  const [quote, setQuote] = useState<PartnerBookingQuote | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    collectionCentresApi
      .list()
      .then(setCentres)
      .catch(() => setCentres([]));
  }, []);

  const token = patient?.patientToken ?? "";
  const ready = token && tests.length > 0 && (collectionType === "HOME" ? addressId : centreId);
  const input = ready
    ? {
        patientToken: token,
        collectionType,
        ...(collectionType === "HOME" ? { addressId } : { collectionCenterId: centreId }),
        items: tests.map((t) => ({ itemType: t.itemType, itemId: t.itemId })),
        ...(printed ? { printedReport: true } : {}),
      }
    : null;
  const inputKey = input ? JSON.stringify(input) : "";

  useEffect(() => {
    setQuote(null);
    setQuoteError("");
    if (!inputKey) return;
    let current = true;
    const t = setTimeout(() => {
      partnerBookingsApi
        .quote(JSON.parse(inputKey))
        .then((q) => current && setQuote(q))
        .catch((err) => current && setQuoteError(errorText(err, "Couldn't price this booking")));
    }, 300);
    return () => {
      current = false;
      clearTimeout(t);
    };
  }, [inputKey]);

  async function create() {
    if (!input || !slotId || !consent) return;
    setCreating(true);
    setCreateError("");
    try {
      const r = await partnerBookingsApi.create({
        ...input,
        slotId,
        scheduledDate: date,
        patientConsent: true,
        ...(printed ? { printedReportTermsAccepted: printedAgreed } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      onBooked({ orderNumber: r.orderNumber, total: r.total });
    } catch (err) {
      setCreateError(errorText(err, "Couldn't create the booking"));
      setCreating(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <Step n={1} title="Patient" icon={ShieldCheck}>
          {patient ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-success/10 px-4 py-3 text-sm">
              <p className="font-bold text-success">
                ✓ {patient.patient.name ?? "Patient"} · {patient.patient.phone} verified{patient.patient.newAccount ? " (new patient)" : ""}
              </p>
              <button type="button" onClick={() => setPatient(null)} className="text-xs font-bold text-primary hover:underline">
                Change patient
              </button>
            </div>
          ) : (
            <PatientStep
              onVerified={(p) => {
                setPatient(p);
                setAddresses(p.addresses);
                setAddressId((p.addresses.find((a) => a.isDefault) ?? p.addresses[0])?.id ?? "");
              }}
            />
          )}
        </Step>

        {patient ? (
          <>
            <Step n={2} title="Where" icon={MapPin}>
              <div className="flex rounded-xl bg-muted p-1 sm:w-fit">
                {(["HOME", "CENTER"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setCollectionType(t);
                      setSlotId("");
                    }}
                    className={cn("flex-1 rounded-lg px-4 py-1.5 text-sm font-bold", collectionType === t ? "bg-card shadow-sm" : "text-muted-foreground")}
                  >
                    {t === "HOME" ? "Home collection" : "Centre visit"}
                  </button>
                ))}
              </div>
              {collectionType === "HOME" ? (
                <div className="mt-4 space-y-2">
                  {addresses.length === 0 && !addingAddress ? <p className="text-xs text-muted-foreground">No saved address — add the patient's address.</p> : null}
                  {addresses.map((a) => (
                    <label key={a.id} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm", addressId === a.id ? "border-primary bg-primary-soft" : "border-border")}>
                      <input type="radio" name="address" checked={addressId === a.id} onChange={() => setAddressId(a.id)} className="mt-1" />
                      <span>
                        {a.label ? <span className="font-bold">{a.label} · </span> : null}
                        {addressLine(a)}
                      </span>
                    </label>
                  ))}
                  {addingAddress ? (
                    <NewAddressForm<PartnerPatientAddress>
                      save={async (a) => {
                        const r = await partnerBookingsApi.addAddress(token, a as Record<string, string>);
                        setAddresses(r.addresses);
                        return r.address;
                      }}
                      onCancel={() => setAddingAddress(false)}
                      onSaved={(a) => {
                        setAddressId(a.id);
                        setAddingAddress(false);
                      }}
                    />
                  ) : (
                    <button type="button" onClick={() => setAddingAddress(true)} className="text-xs font-bold text-primary hover:underline">
                      + Add a new address
                    </button>
                  )}
                </div>
              ) : (
                <select
                  value={centreId}
                  onChange={(e) => {
                    setCentreId(e.target.value);
                    setSlotId("");
                  }}
                  className={cn(inputClass, "mt-4")}
                >
                  <option value="">Choose a collection centre</option>
                  {centres.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.address}
                    </option>
                  ))}
                </select>
              )}
            </Step>

            <Step n={3} title="Tests" icon={Package}>
              <TestPicker value={tests} onChange={setTests} />
              <label className="mt-4 flex items-start gap-2 text-sm">
                <input type="checkbox" checked={printed} onChange={(e) => setPrinted(e.target.checked)} className="mt-1" />
                <span>
                  <span className="font-bold">Printed reports</span> <span className="text-muted-foreground">(otherwise Go Green — digital reports)</span>
                </span>
              </label>
              {printed ? (
                <div className="mt-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs">
                  <p>{quote?.printedReportTerms ?? "Courier / postage charges for printed reports are paid by the patient; the lab calls them to confirm."}</p>
                  <label className="mt-2 flex items-start gap-2 font-bold">
                    <input type="checkbox" checked={printedAgreed} onChange={(e) => setPrintedAgreed(e.target.checked)} className="mt-0.5" />
                    The patient agrees to pay the courier / postage charges.
                  </label>
                </div>
              ) : null}
            </Step>

            <Step n={4} title="Date & slot" icon={CalendarCheck}>
              <SlotPicker
                date={date}
                slotId={slotId}
                collectionType={collectionType}
                collectionCenterId={collectionType === "CENTER" ? centreId || undefined : undefined}
                onChange={(d, s) => {
                  setDate(d);
                  setSlotId(s);
                }}
              />
            </Step>
          </>
        ) : null}
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-extrabold">
            <Receipt className="h-4 w-4 text-primary" /> Summary
          </div>
          <div className="mt-4 space-y-1.5 text-sm">
            {!input ? (
              <p className="text-xs text-muted-foreground">Verify the patient, choose where and add tests to see the price.</p>
            ) : quoteError ? (
              <p className="text-xs font-semibold text-destructive">{quoteError}</p>
            ) : !quote ? (
              <p className="text-xs text-muted-foreground">Working out the price…</p>
            ) : (
              <>
                <div className="flex justify-between">
                  <span>Tests ({quote.items.length})</span>
                  <span className="font-semibold">₹{quote.subtotal}</span>
                </div>
                {quote.discount ? (
                  <div className="flex justify-between text-success">
                    <span>Discount</span>
                    <span className="font-semibold">-₹{quote.discount}</span>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <span>Collection charge</span>
                  <span className="font-semibold">₹{quote.collectionFee}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-2 text-base font-extrabold">
                  <span>Patient pays at collection</span>
                  <span className="text-primary">₹{quote.total}</span>
                </div>
                {quote.labName ? <p className="text-xs text-muted-foreground">Lab: {quote.labName}</p> : null}
                {!quote.withinRange ? <p className="text-xs font-semibold text-warning">This address is outside the normal home-collection range.</p> : null}
              </>
            )}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional), e.g. clinical details"
            rows={2}
            maxLength={300}
            className="mt-4 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none"
          />
          <label className="mt-3 flex items-start gap-2 text-xs font-semibold">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
            The patient asked me to book these tests for them.
          </label>
          {createError ? <p className="mt-3 text-xs font-semibold text-destructive">{createError}</p> : null}
          <button
            type="button"
            disabled={!input || !slotId || !quote || !consent || (printed && !printedAgreed) || creating}
            onClick={create}
            className="mt-4 w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? "Booking…" : input && !slotId ? "Choose a slot" : "Confirm booking"}
          </button>
          <button type="button" onClick={onCancel} className="mt-2 w-full text-xs font-bold text-muted-foreground hover:underline">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
