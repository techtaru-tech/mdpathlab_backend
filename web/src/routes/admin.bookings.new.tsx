import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CalendarCheck, MapPin, Package, Receipt, User } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { addressLine, inputClass, NewAddressForm, SlotPicker, TestPicker, todayIst, type PickedTest } from "@/components/admin/booking/BookingFormParts";
import { PatientPicker } from "@/components/admin/booking/PatientPicker";
import {
  AdminApiError,
  adminCollectionCentersApi,
  adminOrdersApi,
  adminPatientsApi,
  type AdminBookingQuote,
  type AdminCollectionCenter,
  type AdminCreateBookingInput,
  type AdminPatientDetail,
} from "@/lib/admin-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/bookings/new")({
  head: () => ({ meta: [{ title: "New Booking — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminNewBookingPage,
});

function Step({ n, title, icon: Icon, children }: { n: number; title: string; icon: typeof User; children: React.ReactNode }) {
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

function AdminNewBookingPage() {
  const navigate = useNavigate();
  const [patientId, setPatientId] = useState("");
  const [patient, setPatient] = useState<AdminPatientDetail | null>(null);
  const [collectionType, setCollectionType] = useState<"HOME" | "CENTER">("HOME");
  const [addressId, setAddressId] = useState("");
  const [addingAddress, setAddingAddress] = useState(false);
  const [centres, setCentres] = useState<AdminCollectionCenter[]>([]);
  const [centreId, setCentreId] = useState("");
  const [tests, setTests] = useState<PickedTest[]>([]);
  const [forMember, setForMember] = useState("");
  const [date, setDate] = useState(todayIst());
  const [slotId, setSlotId] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [note, setNote] = useState("");
  const [quote, setQuote] = useState<AdminBookingQuote | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    adminCollectionCentersApi
      .list()
      .then((c) => setCentres(c.filter((x) => x.status === "ACTIVE")))
      .catch(() => setCentres([]));
  }, []);

  useEffect(() => {
    setPatient(null);
    setAddressId("");
    setForMember("");
    if (!patientId) return;
    adminPatientsApi
      .get(patientId)
      .then((p) => {
        setPatient(p);
        const live = p.addresses.filter((a) => !a.deletedAt);
        setAddressId((live.find((a) => a.isDefault) ?? live[0])?.id ?? "");
      })
      .catch(() => setPatient(null));
  }, [patientId]);

  const input: AdminCreateBookingInput | null =
    patientId && tests.length > 0 && (collectionType === "HOME" ? addressId : centreId)
      ? {
          userId: patientId,
          collectionType,
          ...(collectionType === "HOME" ? { addressId } : { collectionCenterId: centreId }),
          items: tests.map((t) => ({ itemType: t.itemType, itemId: t.itemId, ...(forMember ? { familyMemberId: forMember } : {}) })),
          slotId,
          scheduledDate: date,
          ...(couponCode.trim() ? { couponCode: couponCode.trim() } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        }
      : null;
  const inputKey = input ? JSON.stringify({ ...input, slotId: "", note: "" }) : "";

  // The summary follows every change: same prices, lab and fee the booking will really get.
  useEffect(() => {
    setQuote(null);
    setQuoteError("");
    if (!inputKey) return;
    let current = true;
    const t = setTimeout(() => {
      adminOrdersApi
        .quote({ ...(JSON.parse(inputKey) as AdminCreateBookingInput), slotId: "x" })
        .then((q) => current && setQuote(q))
        .catch((err) => current && setQuoteError(err instanceof AdminApiError ? err.message : "Couldn't price this booking"));
    }, 300);
    return () => {
      current = false;
      clearTimeout(t);
    };
  }, [inputKey]);

  async function create() {
    if (!input || !slotId) return;
    setCreating(true);
    setCreateError("");
    try {
      const order = await adminOrdersApi.create(input);
      navigate({ to: "/admin/bookings/$orderId", params: { orderId: order.id } });
    } catch (err) {
      setCreateError(err instanceof AdminApiError ? err.message : "Couldn't create the booking");
      setCreating(false);
    }
  }

  const liveAddresses = patient?.addresses.filter((a) => !a.deletedAt) ?? [];

  return (
    <AdminLayout activePath="/admin/bookings">
      <Link to="/admin/bookings" className="flex items-center gap-1.5 text-sm font-bold text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to bookings
      </Link>
      <AdminPageHeader
        title="New booking"
        description="Book tests for a patient — over the phone, at the counter or on their behalf. The patient pays at collection and gets the usual confirmation (app, SMS, email)."
      />

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Step n={1} title="Patient" icon={User}>
            <PatientPicker patient={patient} onPick={setPatientId} />
          </Step>

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
                {!patient ? (
                  <p className="text-xs text-muted-foreground">Choose the patient first.</p>
                ) : (
                  <>
                    {liveAddresses.length === 0 && !addingAddress ? <p className="text-xs text-muted-foreground">This patient has no saved address yet.</p> : null}
                    {liveAddresses.map((a) => (
                      <label
                        key={a.id}
                        className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm", addressId === a.id ? "border-primary bg-primary-soft" : "border-border")}
                      >
                        <input type="radio" name="address" checked={addressId === a.id} onChange={() => setAddressId(a.id)} className="mt-1" />
                        <span>
                          {a.label ? <span className="font-bold">{a.label} · </span> : null}
                          {addressLine(a)}
                          {a.phone ? <span className="text-muted-foreground"> · {a.phone}</span> : null}
                        </span>
                      </label>
                    ))}
                    {addingAddress ? (
                      <NewAddressForm
                        patientId={patient.id}
                        onCancel={() => setAddingAddress(false)}
                        onSaved={(a) => {
                          setPatient((p) => (p ? { ...p, addresses: [...p.addresses, a] } : p));
                          setAddressId(a.id);
                          setAddingAddress(false);
                        }}
                      />
                    ) : (
                      <button type="button" onClick={() => setAddingAddress(true)} className="text-xs font-bold text-primary hover:underline">
                        + Add a new address
                      </button>
                    )}
                  </>
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
            {patient && patient.familyMembers.length > 0 ? (
              <label className="mb-3 flex flex-wrap items-center gap-2 text-sm font-semibold">
                For
                <select value={forMember} onChange={(e) => setForMember(e.target.value)} className={cn(inputClass, "w-auto")}>
                  <option value="">{patient.name || "The patient"} (self)</option>
                  {patient.familyMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.relation})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <TestPicker value={tests} onChange={setTests} />
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
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-extrabold">
              <Receipt className="h-4 w-4 text-primary" /> Summary
            </div>
            <input value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} placeholder="Coupon code (optional)" className={cn(inputClass, "mt-4")} />
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note for the booking history (optional), e.g. booked over the phone"
              rows={2}
              maxLength={300}
              className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none"
            />

            <div className="mt-4 space-y-1.5 text-sm">
              {!input ? (
                <p className="text-xs text-muted-foreground">Choose the patient, where, and at least one test to see the price.</p>
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
                      <span>Coupon discount</span>
                      <span className="font-semibold">-₹{quote.discount}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between">
                    <span>Collection fee</span>
                    <span className="font-semibold">₹{quote.collectionFee}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2 text-base font-extrabold">
                    <span>To pay at collection</span>
                    <span className="text-primary">₹{quote.total}</span>
                  </div>
                  {quote.labName ? <p className="text-xs text-muted-foreground">Lab: {quote.labName}</p> : null}
                  {!quote.withinRange ? <p className="text-xs font-semibold text-warning">This address is outside the normal home-collection range.</p> : null}
                </>
              )}
            </div>

            {createError ? <p className="mt-3 text-xs font-semibold text-destructive">{createError}</p> : null}
            <button
              type="button"
              disabled={!input || !slotId || !quote || creating}
              onClick={create}
              className="mt-4 w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? "Creating booking…" : !slotId && input ? "Choose a slot" : "Create booking"}
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
