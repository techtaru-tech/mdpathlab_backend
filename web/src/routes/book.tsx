import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import {
  BadgeCheck,
  Check,
  ChevronRight,
  Clock,
  CreditCard,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  ShieldCheck,
  ThumbsUp,
  Truck,
  User,
  Wallet,
} from "lucide-react";
import {
  ApiError,
  cartApi,
  couponsApi,
  ordersApi,
  patientsApi,
  paymentsApi,
  session,
  slotsApi,
  type Address,
  type FamilyMember,
  type Order,
  type Slot,
} from "@/lib/api";
import { resolveCatalogueItemBySlug, type ResolvedCatalogueItem } from "@/lib/catalogue";
import { loadRazorpayScript } from "@/lib/razorpay";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { cn } from "@/lib/utils";

const title = "Book a Home Sample Collection — MD Path Lab";
const description =
  "Pick your test or full body package, choose a slot and our certified phlebotomist collects your sample at home — free of charge.";

export const Route = createFileRoute("/book")({
  validateSearch: z.object({ item: z.string().optional() }),
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BookPage,
});

const paymentMethods = [
  { id: "ONLINE" as const, icon: CreditCard, label: "Pay online", text: "UPI, card or net banking" },
  { id: "COD" as const, icon: Wallet, label: "Pay after collection", text: "Cash or UPI to phlebotomist" },
];

const trustItems = [
  { icon: Truck, label: "Free home sample collection", tint: "bg-primary-soft text-primary" },
  { icon: ShieldCheck, label: "NABL & CAP certified labs", tint: "bg-success-soft text-success" },
  { icon: BadgeCheck, label: "Certified phlebotomists", tint: "bg-secondary-soft text-secondary" },
  { icon: Check, label: "Free cancellation up to 2 hrs before", tint: "bg-warning/15 text-warning" },
];

function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function BookPage() {
  const { item } = Route.useSearch();
  const isAuthed = session.getToken() !== null;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [resolvedItem, setResolvedItem] = useState<ResolvedCatalogueItem | null>(null);

  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);

  const [familyMemberId, setFamilyMemberId] = useState("");
  const [addressId, setAddressId] = useState("");
  const [slotId, setSlotId] = useState("");
  const [scheduledDate, setScheduledDate] = useState(tomorrowISO());
  const [paymentMethod, setPaymentMethod] = useState<"ONLINE" | "COD">("ONLINE");

  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState<number | null>(null);
  const [couponError, setCouponError] = useState("");
  const [applyingCoupon, setApplyingCoupon] = useState(false);

  const [showAddFamily, setShowAddFamily] = useState(false);
  const [newFamily, setNewFamily] = useState({ name: "", relation: "Self", gender: "", dob: "" });
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [newAddress, setNewAddress] = useState({ label: "Home", line1: "", city: "", pincode: "", phone: "" });

  const [submitting, setSubmitting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [order, setOrder] = useState<Order | null>(null);

  useEffect(() => {
    if (!isAuthed) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const [fam, addr, slotList] = await Promise.all([
          patientsApi.listFamilyMembers(),
          patientsApi.listAddresses(),
          slotsApi.list(),
        ]);
        setFamilyMembers(fam);
        setAddresses(addr);
        setSlots(slotList);
        if (fam.length > 0) setFamilyMemberId(fam[0]!.id);
        else setShowAddFamily(true);
        const defaultAddress = addr.find((a) => a.isDefault) ?? addr[0];
        if (defaultAddress) setAddressId(defaultAddress.id);
        else setShowAddAddress(true);
        if (slotList.length > 0) setSlotId(slotList[0]!.id);

        if (item) {
          const resolved = await resolveCatalogueItemBySlug(item);
          setResolvedItem(resolved);
          await cartApi.clear();
          await cartApi.add({ itemType: resolved.itemType, itemId: resolved.id });
        }
      } catch (err) {
        setLoadError(err instanceof ApiError ? err.message : "Couldn't load booking details");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, isAuthed]);

  const price = resolvedItem?.price ?? 0;
  const mrp = resolvedItem?.mrp ?? 0;
  const off = mrp > price ? Math.round(100 - (price / mrp) * 100) : 0;
  const discount = couponDiscount ?? 0;
  const total = Math.max(price - discount, 0);

  async function handleAddFamilyMember() {
    if (!newFamily.name.trim() || !newFamily.relation.trim()) {
      setSubmitError("Enter the patient's name to continue");
      return;
    }
    try {
      const created = await patientsApi.addFamilyMember({
        name: newFamily.name,
        relation: newFamily.relation,
        ...(newFamily.gender ? { gender: newFamily.gender } : {}),
        ...(newFamily.dob ? { dob: newFamily.dob } : {}),
      });
      setFamilyMembers((prev) => [...prev, created]);
      setFamilyMemberId(created.id);
      setShowAddFamily(false);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Couldn't add patient profile");
    }
  }

  async function handleAddAddress() {
    if (!newAddress.line1.trim() || !newAddress.city.trim() || !/^\d{6}$/.test(newAddress.pincode)) {
      setSubmitError("Enter address line, city and a valid 6-digit pincode to continue");
      return;
    }
    try {
      const created = await patientsApi.addAddress({
        line1: newAddress.line1,
        city: newAddress.city,
        pincode: newAddress.pincode,
        ...(newAddress.label ? { label: newAddress.label } : {}),
        ...(newAddress.phone ? { phone: newAddress.phone } : {}),
        isDefault: addresses.length === 0,
      });
      setAddresses((prev) => [...prev, created]);
      setAddressId(created.id);
      setShowAddAddress(false);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Couldn't add address");
    }
  }

  async function applyCoupon() {
    if (!couponCode || !resolvedItem) return;
    setApplyingCoupon(true);
    setCouponError("");
    try {
      const res = await couponsApi.apply(couponCode, price);
      setCouponDiscount(res.discount);
    } catch (err) {
      setCouponDiscount(null);
      setCouponError(err instanceof ApiError ? err.message : "Invalid coupon");
    } finally {
      setApplyingCoupon(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!resolvedItem || !addressId || !slotId) return;
    setSubmitting(true);
    setSubmitError("");

    try {
      const created = await ordersApi.checkout({
        collectionType: "HOME",
        addressId,
        slotId,
        scheduledDate,
        ...(couponDiscount !== null ? { couponCode } : {}),
        paymentMethod,
      });

      if (paymentMethod === "COD") {
        setOrder(created);
        return;
      }

      await loadRazorpayScript();
      const rp = await paymentsApi.createRazorpayOrder(created.id);
      setPaying(true);
      const rzp = new window.Razorpay({
        key: rp.keyId,
        amount: rp.amount,
        currency: rp.currency,
        order_id: rp.razorpayOrderId,
        name: "MD Path Lab",
        description: resolvedItem.name,
        ...(session.getUser()?.phone ? { prefill: { contact: session.getUser()!.phone } } : {}),
        theme: { color: "#38768C" },
        handler: (response) => {
          paymentsApi
            .verify(created.id, {
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            })
            .then(setOrder)
            .catch(() =>
              setSubmitError(
                `Payment went through but verification failed — please contact support with order ${created.orderNumber}`,
              ),
            )
            .finally(() => setPaying(false));
        },
        modal: { ondismiss: () => setPaying(false) },
      });
      rzp.open();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Something went wrong — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="relative py-12 lg:py-16">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-gradient-to-b from-primary via-primary/70 to-transparent lg:h-[360px]" />

      <div className="container-page relative mb-6">
        <nav className="flex items-center gap-1.5 text-xs font-semibold text-primary-foreground/80">
          <Link to="/" className="hover:text-primary-foreground">
            Home
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-primary-foreground">Book a slot</span>
        </nav>
        <h1 className="mt-3 text-2xl font-extrabold text-primary-foreground sm:text-3xl">
          Book your free home sample collection
        </h1>
        <p className="mt-2 max-w-xl text-sm text-primary-foreground/80">
          Choose what you want tested and when you're free. A certified phlebotomist arrives with a
          sealed, single-use kit.
        </p>
      </div>

      <div className="container-page relative">
        {!isAuthed ? (
          <div className="surface-card mx-auto max-w-md p-10 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-primary">
              <User className="h-7 w-7" />
            </span>
            <h2 className="mt-5 text-xl font-extrabold">Log in to continue booking</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              We use your mobile number to confirm your booking and send report updates.
            </p>
            <Link
              to="/login"
              search={{ redirect: `/book${item ? `?item=${encodeURIComponent(item)}` : ""}` }}
              className="mt-6 block"
            >
              <ActionButton variant="primary" size="lg" className="w-full">
                Log in
              </ActionButton>
            </Link>
          </div>
        ) : loading ? (
          <div className="surface-card mx-auto max-w-md p-10 text-center text-sm text-muted-foreground">
            Loading your booking details…
          </div>
        ) : loadError ? (
          <div className="surface-card mx-auto max-w-md p-10 text-center">
            <p className="text-sm font-semibold text-destructive">{loadError}</p>
          </div>
        ) : !resolvedItem ? (
          <div className="surface-card mx-auto max-w-md p-10 text-center">
            <h2 className="text-xl font-extrabold">Nothing selected yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Pick a test or health package first, then come back here to book it.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link to="/tests">
                <ActionButton variant="outline" size="md">
                  Browse tests
                </ActionButton>
              </Link>
              <Link to="/packages">
                <ActionButton variant="primary" size="md">
                  Browse packages
                </ActionButton>
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
            <div className="flex-1 space-y-6">
              {order ? (
                <div className="surface-card p-10 text-center">
                  <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-success-soft text-success">
                    <Check className="h-7 w-7" />
                  </span>
                  <h2 className="mt-5 text-2xl font-extrabold">Booking confirmed</h2>
                  <p className="mt-3 text-sm text-muted-foreground">
                    Order <strong className="text-foreground">{order.orderNumber}</strong> for{" "}
                    <strong className="text-foreground">{resolvedItem.name}</strong> is{" "}
                    {order.paymentMethod === "COD" ? "confirmed — pay on collection" : "paid and confirmed"}. We'll
                    message you on WhatsApp with phlebotomist details.
                  </p>
                  <Link to="/dashboard" className="mt-7 inline-block">
                    <ActionButton variant="outline" size="md">
                      View my bookings
                    </ActionButton>
                  </Link>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="surface-card p-7 shadow-[var(--shadow-lift)]">
                    <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">
                      What you're booking
                    </h2>
                    <div className="mt-4 flex items-center justify-between gap-4 rounded-xl bg-primary-soft p-4">
                      <p className="truncate text-sm font-bold">{resolvedItem.name}</p>
                      <div className="shrink-0 text-right">
                        <p className="text-lg font-extrabold text-primary">₹{price}</p>
                        {off > 0 ? <p className="text-xs text-muted-foreground line-through">₹{mrp}</p> : null}
                      </div>
                    </div>
                  </div>

                  <div className="surface-card p-7">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">
                        Patient
                      </h2>
                      <button
                        type="button"
                        onClick={() => setShowAddFamily((v) => !v)}
                        className="flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add patient
                      </button>
                    </div>

                    {familyMembers.length > 0 ? (
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        {familyMembers.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setFamilyMemberId(m.id)}
                            className={cn(
                              "flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-bold transition-colors",
                              familyMemberId === m.id
                                ? "border-primary bg-primary-soft text-primary"
                                : "border-border hover:border-primary/30",
                            )}
                          >
                            {m.name}
                            <span className="text-xs font-semibold text-muted-foreground">{m.relation}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-muted-foreground">
                        Add at least one patient profile to continue — this is required before your first booking.
                      </p>
                    )}

                    {showAddFamily ? (
                      <div className="mt-4 grid gap-3 rounded-xl bg-muted p-4 sm:grid-cols-2">
                        <input
                          required
                          value={newFamily.name}
                          onChange={(e) => setNewFamily((f) => ({ ...f, name: e.target.value }))}
                          placeholder="Full name"
                          className="h-11 rounded-lg border border-border bg-card px-3 text-sm font-medium focus:outline-none"
                        />
                        <select
                          value={newFamily.relation}
                          onChange={(e) => setNewFamily((f) => ({ ...f, relation: e.target.value }))}
                          className="h-11 rounded-lg border border-border bg-card px-3 text-sm font-semibold focus:outline-none"
                        >
                          {["Self", "Spouse", "Child", "Parent", "Other"].map((r) => (
                            <option key={r}>{r}</option>
                          ))}
                        </select>
                        <select
                          value={newFamily.gender}
                          onChange={(e) => setNewFamily((f) => ({ ...f, gender: e.target.value }))}
                          className="h-11 rounded-lg border border-border bg-card px-3 text-sm font-semibold focus:outline-none"
                        >
                          <option value="">Gender (optional)</option>
                          <option value="FEMALE">Female</option>
                          <option value="MALE">Male</option>
                          <option value="OTHER">Other</option>
                        </select>
                        <input
                          type="date"
                          value={newFamily.dob}
                          onChange={(e) => setNewFamily((f) => ({ ...f, dob: e.target.value }))}
                          className="h-11 rounded-lg border border-border bg-card px-3 text-sm font-medium focus:outline-none"
                        />
                        <ActionButton type="button" onClick={handleAddFamilyMember} variant="primary" size="sm" className="sm:col-span-2">
                          Save patient
                        </ActionButton>
                      </div>
                    ) : null}
                  </div>

                  <div className="surface-card p-7">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">
                        Collection address
                      </h2>
                      <button
                        type="button"
                        onClick={() => setShowAddAddress((v) => !v)}
                        className="flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add address
                      </button>
                    </div>

                    {addresses.length > 0 ? (
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        {addresses.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => setAddressId(a.id)}
                            className={cn(
                              "rounded-xl border px-4 py-3 text-left text-xs font-semibold transition-colors",
                              addressId === a.id
                                ? "border-primary bg-primary-soft text-primary"
                                : "border-border text-muted-foreground hover:border-primary/30",
                            )}
                          >
                            <span className="block text-sm font-bold text-foreground">{a.label ?? "Address"}</span>
                            {a.line1}, {a.city} {a.pincode}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-muted-foreground">Add a collection address to continue.</p>
                    )}

                    {showAddAddress ? (
                      <div className="mt-4 grid gap-3 rounded-xl bg-muted p-4 sm:grid-cols-2">
                        <input
                          value={newAddress.label}
                          onChange={(e) => setNewAddress((a) => ({ ...a, label: e.target.value }))}
                          placeholder="Label (e.g. Home)"
                          className="h-11 rounded-lg border border-border bg-card px-3 text-sm font-medium focus:outline-none sm:col-span-2"
                        />
                        <input
                          required
                          value={newAddress.line1}
                          onChange={(e) => setNewAddress((a) => ({ ...a, line1: e.target.value }))}
                          placeholder="House / street / landmark"
                          className="h-11 rounded-lg border border-border bg-card px-3 text-sm font-medium focus:outline-none sm:col-span-2"
                        />
                        <input
                          required
                          value={newAddress.city}
                          onChange={(e) => setNewAddress((a) => ({ ...a, city: e.target.value }))}
                          placeholder="City"
                          className="h-11 rounded-lg border border-border bg-card px-3 text-sm font-medium focus:outline-none"
                        />
                        <input
                          required
                          inputMode="numeric"
                          value={newAddress.pincode}
                          onChange={(e) => setNewAddress((a) => ({ ...a, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                          placeholder="Pincode"
                          className="h-11 rounded-lg border border-border bg-card px-3 text-sm font-medium focus:outline-none"
                        />
                        <input
                          inputMode="tel"
                          value={newAddress.phone}
                          onChange={(e) => setNewAddress((a) => ({ ...a, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
                          placeholder="Contact number (optional)"
                          className="h-11 rounded-lg border border-border bg-card px-3 text-sm font-medium focus:outline-none sm:col-span-2"
                        />
                        <ActionButton type="button" onClick={handleAddAddress} variant="primary" size="sm" className="sm:col-span-2">
                          Save address
                        </ActionButton>
                      </div>
                    ) : null}
                  </div>

                  <div className="surface-card p-7">
                    <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">
                      Pick a collection date & slot
                    </h2>
                    <input
                      type="date"
                      required
                      min={tomorrowISO()}
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className="mt-4 h-12 w-full rounded-xl border border-border bg-muted px-4 text-sm font-semibold focus:outline-none sm:w-56"
                    />
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {slots.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setSlotId(s.id)}
                          className={cn(
                            "flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold transition-colors",
                            slotId === s.id
                              ? "border-primary bg-primary-soft text-primary"
                              : "border-border hover:border-primary/30",
                          )}
                        >
                          <Clock className="h-4 w-4" /> {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="surface-card p-7">
                    <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">
                      Have a coupon?
                    </h2>
                    <div className="mt-4 flex gap-2">
                      <input
                        value={couponCode}
                        onChange={(e) => {
                          setCouponCode(e.target.value.toUpperCase());
                          setCouponDiscount(null);
                          setCouponError("");
                        }}
                        placeholder="Enter coupon code"
                        className="h-12 flex-1 rounded-xl border border-border bg-muted px-4 text-sm font-semibold uppercase focus:outline-none"
                      />
                      <ActionButton
                        type="button"
                        variant="outline"
                        size="md"
                        onClick={applyCoupon}
                        disabled={!couponCode || applyingCoupon}
                      >
                        {applyingCoupon ? "Checking…" : "Apply"}
                      </ActionButton>
                    </div>
                    {couponDiscount !== null ? (
                      <p className="mt-2 text-xs font-bold text-success">Coupon applied — ₹{couponDiscount} off</p>
                    ) : null}
                    {couponError ? <p className="mt-2 text-xs font-semibold text-destructive">{couponError}</p> : null}
                  </div>

                  <div className="surface-card p-7">
                    <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">
                      Payment method
                    </h2>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {paymentMethods.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setPaymentMethod(m.id)}
                          className={cn(
                            "flex items-start gap-3 rounded-xl border p-4 text-left transition-colors",
                            paymentMethod === m.id
                              ? "border-primary bg-primary-soft"
                              : "border-border hover:border-primary/30",
                          )}
                        >
                          <span
                            className={cn(
                              "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
                              paymentMethod === m.id ? "bg-primary text-primary-foreground" : "bg-muted text-primary",
                            )}
                          >
                            <m.icon className="h-4.5 w-4.5" />
                          </span>
                          <span>
                            <span className="block text-sm font-bold">{m.label}</span>
                            <span className="block text-xs text-muted-foreground">{m.text}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {submitError ? (
                    <p className="rounded-xl bg-destructive/10 p-4 text-sm font-semibold text-destructive">
                      {submitError}
                    </p>
                  ) : null}

                  <ActionButton
                    variant="primary"
                    size="lg"
                    className="w-full"
                    type="submit"
                    disabled={submitting || paying || familyMembers.length === 0 || addresses.length === 0}
                  >
                    {paying
                      ? "Waiting for payment…"
                      : submitting
                        ? "Confirming…"
                        : `Confirm booking · ₹${total}`}
                  </ActionButton>
                </form>
              )}

              {!order ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {trustItems.map((t) => (
                    <div key={t.label} className="surface-card flex items-center gap-3 p-4">
                      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", t.tint)}>
                        <t.icon className="h-4.5 w-4.5" />
                      </span>
                      <p className="text-xs font-semibold">{t.label}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {!order ? (
              <aside className="w-full space-y-5 lg:sticky lg:top-36 lg:w-[380px] lg:shrink-0">
                <div className="rounded-[var(--radius-lg)] border border-warning/25 bg-warning/10 p-7 shadow-[var(--shadow-lift)]">
                  <span className="rounded-full bg-warning/25 px-3 py-1 text-[11px] font-bold text-foreground uppercase">
                    Order summary
                  </span>

                  <div className="mt-4 flex items-start justify-between gap-3 border-t border-dashed border-warning/25 pt-4">
                    <p className="truncate text-sm font-bold">{resolvedItem.name}</p>
                    <p className="shrink-0 text-sm font-bold">₹{price}</p>
                  </div>

                  <div className="mt-3 space-y-2 border-t border-dashed border-warning/25 pt-3 text-xs">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Home sample collection</span>
                      <span className="font-bold text-success">FREE</span>
                    </div>
                    {couponDiscount !== null ? (
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>Coupon discount</span>
                        <span className="font-bold text-success">-₹{couponDiscount}</span>
                      </div>
                    ) : off > 0 ? (
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>Package discount</span>
                        <span className="font-bold text-success">-₹{mrp - price} ({off}% off)</span>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-warning/25 pt-4">
                    <span className="text-sm font-extrabold">Amount payable</span>
                    <span className="text-2xl font-extrabold text-primary">₹{total}</span>
                  </div>

                  <div className="mt-4 flex items-center gap-2 rounded-xl bg-card/70 px-4 py-2.5">
                    <MapPin className="h-4 w-4 shrink-0 text-primary" />
                    <p className="text-xs font-semibold text-foreground/80">
                      {addresses.find((a) => a.id === addressId)?.city ?? "Select an address"}
                    </p>
                  </div>
                  <div className="mt-2 flex items-center gap-2 rounded-xl bg-card/70 px-4 py-2.5">
                    <Clock className="h-4 w-4 shrink-0 text-primary" />
                    <p className="text-xs font-semibold text-foreground/80">
                      {slots.find((s) => s.id === slotId)?.label ?? "Select a slot"}
                    </p>
                  </div>

                  <div className="mt-4 flex items-center gap-2 border-t border-warning/20 pt-3">
                    <ThumbsUp className="h-4 w-4 shrink-0 text-warning" />
                    <p className="text-xs font-semibold text-muted-foreground">12,000+ bookings this week</p>
                  </div>
                </div>

                <div className="rounded-[var(--radius-lg)] border border-success/20 bg-success-soft p-6">
                  <p className="text-sm font-bold">Need help booking?</p>
                  <p className="mt-1 text-xs text-muted-foreground">Talk to our health advisors.</p>
                  <a href="tel:8400100800" className="mt-4 flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-card text-success">
                      <Phone className="h-4.5 w-4.5" />
                    </span>
                    <span className="text-sm font-bold">8400100800</span>
                  </a>
                  <Link to="/contact" className="mt-3 flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-card text-success">
                      <MessageCircle className="h-4.5 w-4.5" />
                    </span>
                    <span className="text-sm font-bold">Request a callback</span>
                  </Link>
                </div>
              </aside>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
