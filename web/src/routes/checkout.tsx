import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  Check,
  Clock,
  CreditCard,
  Loader2,
  MapPin,
  Navigation,
  Pencil,
  Plus,
  ShieldCheck,
  Truck,
  User,
  Wallet,
} from "lucide-react";
import {
  ApiError,
  cartApi,
  collectionCentresApi,
  ordersApi,
  patientsApi,
  session,
  slotsApi,
  type Address,
  type CartItem,
  type CollectionCentre,
  type FamilyMember,
  type NewAddressInput,
  type OrderQuote,
  type Slot,
} from "@/lib/api";
import { getCurrentPosition } from "@/lib/geolocation";
import { payForOrder } from "@/lib/payment";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { LocationPickerDialog, type PickedLocation } from "@/components/LocationPickerDialog";
import { cn } from "@/lib/utils";

const title = "Checkout — MD Path Lab";

export const Route = createFileRoute("/checkout")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  head: () => ({ meta: [{ title }, { name: "robots", content: "noindex" }] }),
  component: CheckoutPage,
});

function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function isPastSlotToday(scheduledDate: string, slot: Slot) {
  const today = new Date().toISOString().slice(0, 10);
  if (scheduledDate !== today) return false;
  const [h, m] = slot.startTime.split(":").map(Number);
  const slotTime = new Date();
  slotTime.setHours(h ?? 0, m ?? 0, 0, 0);
  return slotTime.getTime() <= Date.now();
}

function CheckoutPage() {
  const isAuthed = session.getToken() !== null;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [centres, setCentres] = useState<CollectionCentre[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);

  const [collectionType, setCollectionType] = useState<"HOME" | "CENTER">("HOME");
  const [addressId, setAddressId] = useState("");
  const [collectionCenterId, setCollectionCenterId] = useState("");
  const [slotId, setSlotId] = useState("");
  const [scheduledDate, setScheduledDate] = useState(tomorrowISO());
  const [paymentMethod, setPaymentMethod] = useState<"ONLINE" | "COD">("ONLINE");

  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState("");

  const [showAddFamily, setShowAddFamily] = useState(false);
  const [newFamily, setNewFamily] = useState({ name: "", relation: "Self", gender: "", dob: "" });
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [newAddress, setNewAddress] = useState({ label: "Home", line1: "", city: "", pincode: "", phone: "" });
  const [newAddressCoords, setNewAddressCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const [quickFixAddressId, setQuickFixAddressId] = useState<string | null>(null);
  const [quickFixError, setQuickFixError] = useState("");

  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [submitError, setSubmitError] = useState("");

  function loadAll() {
    setLoading(true);
    Promise.all([
      cartApi.list(),
      patientsApi.listFamilyMembers(),
      patientsApi.listAddresses(),
      collectionCentresApi.list(),
      slotsApi.list(),
    ])
      .then(([cart, fam, addr, centreList, slotList]) => {
        setCartItems(cart.items);
        setFamilyMembers(fam);
        setAddresses(addr);
        setCentres(centreList);
        setSlots(slotList);
        const defaultAddress = addr.find((a) => a.isDefault) ?? addr[0];
        if (defaultAddress) setAddressId(defaultAddress.id);
        else if (addr.length === 0) setShowAddAddress(true);
        if (centreList.length > 0) setCollectionCenterId(centreList[0]!.id);
        if (slotList.length > 0) setSlotId(slotList[0]!.id);
        if (fam.length === 0) setShowAddFamily(true);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Couldn't load your checkout"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!isAuthed) {
      setLoading(false);
      return;
    }
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed]);

  const itemsForQuote = useMemo(
    () => cartItems.map((i) => ({ itemType: i.itemType, itemId: i.itemId, ...(i.familyMemberId ? { familyMemberId: i.familyMemberId } : {}) })),
    [cartItems],
  );

  // Re-price whenever anything that affects the total changes — this is the ONLY place price
  // math happens on the frontend; everything else reads `quote`, so the summary and the amount
  // actually charged at checkout can never drift apart.
  useEffect(() => {
    if (!isAuthed || cartItems.length === 0) return;
    if (collectionType === "HOME" && !addressId) return;
    if (collectionType === "CENTER" && !collectionCenterId) return;

    setQuoteLoading(true);
    setQuoteError("");
    const timer = setTimeout(() => {
      ordersApi
        .quote({
          collectionType,
          ...(collectionType === "HOME" ? { addressId } : { collectionCenterId }),
          ...(appliedCoupon ? { couponCode: appliedCoupon } : {}),
          items: itemsForQuote,
        })
        .then(setQuote)
        .catch((err) => {
          setQuote(null);
          setQuoteError(err instanceof ApiError ? err.message : "Couldn't calculate your total");
        })
        .finally(() => setQuoteLoading(false));
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed, cartItems.length, collectionType, addressId, collectionCenterId, appliedCoupon, itemsForQuote]);

  async function handleUseMyLocation() {
    setLocating(true);
    const pos = await getCurrentPosition();
    setNewAddressCoords(pos);
    setLocating(false);
  }

  function handleMapLocationConfirm(result: PickedLocation) {
    setNewAddressCoords({ lat: result.lat, lng: result.lng });
    setNewAddress((a) => ({
      ...a,
      line1: a.line1.trim() ? a.line1 : (result.address?.line1 ?? a.line1),
      city: a.city.trim() ? a.city : (result.address?.city ?? a.city),
      pincode: a.pincode.trim() ? a.pincode : (result.address?.pincode ?? a.pincode),
    }));
  }

  async function handleQuickFixLocationConfirm(address: Address, result: PickedLocation) {
    const dto: NewAddressInput = { line1: address.line1, city: address.city, pincode: address.pincode, lat: result.lat, lng: result.lng };
    if (address.label) dto.label = address.label;
    if (address.state) dto.state = address.state;
    if (address.phone) dto.phone = address.phone;
    try {
      const updated = await patientsApi.updateAddress(address.id, dto);
      setAddresses((prev) => prev.map((a) => (a.id === address.id ? updated : a)));
      setQuickFixError("");
    } catch (err) {
      setQuickFixError(err instanceof ApiError ? err.message : "Couldn't save this location");
    }
  }

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
      setShowAddFamily(false);
      setSubmitError("");
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Couldn't add patient profile");
    }
  }

  function resetAddressForm() {
    setNewAddress({ label: "Home", line1: "", city: "", pincode: "", phone: "" });
    setNewAddressCoords(null);
    setEditingAddressId(null);
  }

  function handleStartEditAddress(address: Address) {
    setNewAddress({
      label: address.label ?? "",
      line1: address.line1,
      city: address.city,
      pincode: address.pincode,
      phone: address.phone ?? "",
    });
    setNewAddressCoords(address.lat && address.lng ? { lat: address.lat, lng: address.lng } : null);
    setEditingAddressId(address.id);
    setShowAddAddress(true);
  }

  async function handleSaveAddress() {
    if (!newAddress.line1.trim() || !newAddress.city.trim() || !/^\d{6}$/.test(newAddress.pincode)) {
      setSubmitError("Enter address line, city and a valid 6-digit pincode to continue");
      return;
    }
    const dto = {
      line1: newAddress.line1,
      city: newAddress.city,
      pincode: newAddress.pincode,
      ...(newAddress.label ? { label: newAddress.label } : {}),
      ...(newAddress.phone ? { phone: newAddress.phone } : {}),
      ...(newAddressCoords ? { lat: newAddressCoords.lat, lng: newAddressCoords.lng } : {}),
    };
    try {
      if (editingAddressId) {
        const updated = await patientsApi.updateAddress(editingAddressId, dto);
        setAddresses((prev) => prev.map((a) => (a.id === editingAddressId ? updated : a)));
      } else {
        const created = await patientsApi.addAddress({ ...dto, isDefault: addresses.length === 0 });
        setAddresses((prev) => [...prev, created]);
        setAddressId(created.id);
      }
      setShowAddAddress(false);
      resetAddressForm();
      setSubmitError("");
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Couldn't save address");
    }
  }

  async function handleAssignPatient(item: CartItem, familyMemberId: string) {
    try {
      const updated = await cartApi.updatePatient(item.id, familyMemberId || null);
      setCartItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
    } catch {
      // non-fatal — the patient assignment can be retried; don't block the whole page on it
    }
  }

  function applyCoupon() {
    setAppliedCoupon(couponCode.trim().toUpperCase());
  }

  const allPatientsAssigned = cartItems.length > 0 && cartItems.every((i) => i.familyMemberId);
  const canSubmit =
    cartItems.length > 0 &&
    allPatientsAssigned &&
    (collectionType === "HOME" ? Boolean(addressId) : Boolean(collectionCenterId)) &&
    Boolean(slotId) &&
    Boolean(scheduledDate) &&
    !quoteLoading &&
    Boolean(quote);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError("");

    try {
      const created = await ordersApi.checkout({
        collectionType,
        ...(collectionType === "HOME" ? { addressId } : { collectionCenterId }),
        slotId,
        scheduledDate,
        ...(appliedCoupon ? { couponCode: appliedCoupon } : {}),
        paymentMethod,
        items: itemsForQuote,
      });

      if (paymentMethod === "COD") {
        window.location.href = `/booking/${created.id}?success=1`;
        return;
      }

      setPaying(true);
      const outcome = await payForOrder(created);
      setPaying(false);

      if (outcome.status === "success") {
        window.location.href = `/booking/${outcome.order.id}?success=1`;
      } else if (outcome.status === "cancelled") {
        setSubmitError("Payment was cancelled. Your booking is saved as unpaid — you can retry payment from My Bookings.");
      } else if (outcome.status === "failed") {
        setSubmitError(`Payment failed — ${outcome.message}. Your booking is saved as unpaid — you can retry from My Bookings.`);
      } else {
        setSubmitError(outcome.message);
      }
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Something went wrong — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isAuthed) {
    return (
      <section className="py-16">
        <div className="container-page mx-auto max-w-md">
          <div className="surface-card p-10 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-primary">
              <User className="h-7 w-7" />
            </span>
            <h1 className="mt-5 text-xl font-extrabold">Log in to continue</h1>
            <Link to="/login" search={{ redirect: "/checkout" }} className="mt-6 block">
              <ActionButton variant="primary" size="lg" className="w-full">
                Log in
              </ActionButton>
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="py-16">
        <div className="container-page mx-auto max-w-md text-center text-sm text-muted-foreground">Loading checkout…</div>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="py-16">
        <div className="container-page mx-auto max-w-md text-center text-sm font-semibold text-destructive">{loadError}</div>
      </section>
    );
  }

  if (cartItems.length === 0) {
    return (
      <section className="py-16">
        <div className="container-page mx-auto max-w-md text-center">
          <div className="surface-card p-10">
            <h1 className="text-xl font-extrabold">Your cart is empty</h1>
            <p className="mt-2 text-sm text-muted-foreground">Add a test or package before checking out.</p>
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
        </div>
      </section>
    );
  }

  return (
    <section className="relative py-12 lg:py-16">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-gradient-to-b from-primary via-primary/70 to-transparent lg:h-[360px]" />

      <div className="container-page relative mb-6">
        <h1 className="text-2xl font-extrabold text-primary-foreground sm:text-3xl">Checkout</h1>
        <p className="mt-2 max-w-xl text-sm text-primary-foreground/80">
          Confirm your patients, collection details and slot to complete your booking.
        </p>
      </div>

      <div className="container-page relative">
        <form onSubmit={handleSubmit} className="flex flex-col gap-8 lg:flex-row lg:items-start">
          <div className="flex-1 space-y-6">
            {/* Items + patient assignment */}
            <div className="surface-card p-7 shadow-[var(--shadow-lift)]">
              <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">
                Items ({cartItems.length})
              </h2>
              <div className="mt-4 space-y-3">
                {cartItems.map((item) => (
                  <div key={item.id} className="flex flex-col gap-3 rounded-xl bg-muted p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{item.catalogueItem?.name ?? "Unavailable item"}</p>
                      <p className="text-xs text-muted-foreground">₹{item.catalogueItem?.price ?? "—"}</p>
                    </div>
                    <select
                      value={item.familyMemberId ?? ""}
                      onChange={(e) => handleAssignPatient(item, e.target.value)}
                      className={cn(
                        "h-10 rounded-lg border bg-card px-2.5 text-xs font-semibold focus:outline-none",
                        item.familyMemberId ? "border-border" : "border-destructive/50",
                      )}
                    >
                      <option value="">Choose patient *</option>
                      {familyMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.relation})
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              {!allPatientsAssigned ? (
                <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" /> Choose a patient for every item to continue.
                </p>
              ) : null}

              <div className="mt-4 flex items-center justify-between border-t border-dashed border-border pt-4">
                <h3 className="text-xs font-extrabold tracking-wide text-muted-foreground uppercase">Patients</h3>
                <button
                  type="button"
                  onClick={() => setShowAddFamily((v) => !v)}
                  className="flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> Add patient
                </button>
              </div>
              {showAddFamily ? (
                <div className="mt-3 grid gap-3 rounded-xl bg-muted p-4 sm:grid-cols-2">
                  <input
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

            {/* Collection method */}
            <div className="surface-card p-7">
              <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Collection method</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setCollectionType("HOME")}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-4 text-left transition-colors",
                    collectionType === "HOME" ? "border-primary bg-primary-soft" : "border-border hover:border-primary/30",
                  )}
                >
                  <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", collectionType === "HOME" ? "bg-primary text-primary-foreground" : "bg-muted text-primary")}>
                    <Truck className="h-4.5 w-4.5" />
                  </span>
                  <span>
                    <span className="block text-sm font-bold">Home Collection</span>
                    <span className="block text-xs text-muted-foreground">Phlebotomist visits your address</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setCollectionType("CENTER")}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-4 text-left transition-colors",
                    collectionType === "CENTER" ? "border-primary bg-primary-soft" : "border-border hover:border-primary/30",
                  )}
                >
                  <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", collectionType === "CENTER" ? "bg-primary text-primary-foreground" : "bg-muted text-primary")}>
                    <Building2 className="h-4.5 w-4.5" />
                  </span>
                  <span>
                    <span className="block text-sm font-bold">Visit Collection Centre</span>
                    <span className="block text-xs text-muted-foreground">Walk in to a nearby centre</span>
                  </span>
                </button>
              </div>
            </div>

            {/* Address or Centre */}
            {collectionType === "HOME" ? (
              <div className="surface-card p-7">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Collection address</h2>
                  <button
                    type="button"
                    onClick={() => {
                      resetAddressForm();
                      setShowAddAddress((v) => !v);
                    }}
                    className="flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add address
                  </button>
                </div>

                {addresses.length > 0 ? (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {addresses.map((a) => (
                      <div
                        key={a.id}
                        className={cn(
                          "relative rounded-xl border px-4 py-3 text-left text-xs font-semibold transition-colors",
                          addressId === a.id ? "border-primary bg-primary-soft text-primary" : "border-border text-muted-foreground hover:border-primary/30",
                        )}
                      >
                        <button type="button" onClick={() => setAddressId(a.id)} className="block w-full pr-6 text-left">
                          <span className="block text-sm font-bold text-foreground">{a.label ?? "Address"}</span>
                          {a.line1}, {a.city} {a.pincode}
                          {a.lat && a.lng ? (
                            <span className="mt-1 flex items-center gap-1 text-[10px] font-bold text-success">
                              <Check className="h-3 w-3" /> Location confirmed
                            </span>
                          ) : (
                            <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-bold text-warning">
                              Location not confirmed
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setQuickFixError("");
                                  setQuickFixAddressId(a.id);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.stopPropagation();
                                    setQuickFixError("");
                                    setQuickFixAddressId(a.id);
                                  }
                                }}
                                className="cursor-pointer underline hover:text-primary"
                              >
                                [Choose Location]
                              </span>
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartEditAddress(a);
                          }}
                          aria-label="Edit address"
                          className="absolute top-2 right-2 rounded-md p-1.5 text-muted-foreground hover:bg-card hover:text-primary"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">Add a collection address to continue.</p>
                )}
                {quickFixError ? <p className="mt-2 text-xs font-semibold text-danger">{quickFixError}</p> : null}

                {showAddAddress ? (
                  <div className="mt-4 grid gap-3 rounded-xl bg-muted p-4 sm:grid-cols-2">
                    <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase sm:col-span-2">
                      {editingAddressId ? "Edit address" : "New address"}
                    </p>
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
                    <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={handleUseMyLocation}
                        disabled={locating}
                        className={cn(
                          "flex h-11 items-center justify-center gap-2 rounded-lg border text-sm font-bold",
                          newAddressCoords ? "border-success/40 bg-success-soft text-success" : "border-dashed border-border text-primary hover:bg-primary-soft",
                        )}
                      >
                        <Navigation className="h-4 w-4" />
                        {locating ? "Locating…" : newAddressCoords ? "Location captured" : "Use my current location"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setMapPickerOpen(true)}
                        className={cn(
                          "flex h-11 items-center justify-center gap-2 rounded-lg border text-sm font-bold",
                          newAddressCoords ? "border-success/40 bg-success-soft text-success" : "border-dashed border-border text-primary hover:bg-primary-soft",
                        )}
                      >
                        <MapPin className="h-4 w-4" />
                        {newAddressCoords ? "Adjust pin on map" : "Choose location on map"}
                      </button>
                    </div>
                    <p className="text-[11px] text-muted-foreground sm:col-span-2">
                      Pinpointing your location gives an accurate home-collection fee.
                    </p>
                    <div className="flex gap-2 sm:col-span-2">
                      <ActionButton type="button" onClick={handleSaveAddress} variant="primary" size="sm" className="flex-1">
                        {editingAddressId ? "Update address" : "Save address"}
                      </ActionButton>
                      <ActionButton
                        type="button"
                        onClick={() => {
                          resetAddressForm();
                          setShowAddAddress(false);
                        }}
                        variant="outline"
                        size="sm"
                      >
                        Cancel
                      </ActionButton>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="surface-card p-7">
                <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Choose a collection centre</h2>
                {centres.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">No collection centres are available right now — please choose home collection instead.</p>
                ) : (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {centres.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCollectionCenterId(c.id)}
                        className={cn(
                          "rounded-xl border px-4 py-3 text-left text-xs font-semibold transition-colors",
                          collectionCenterId === c.id ? "border-primary bg-primary-soft text-primary" : "border-border text-muted-foreground hover:border-primary/30",
                        )}
                      >
                        <span className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                          <Building2 className="h-3.5 w-3.5 shrink-0" /> {c.name}
                        </span>
                        <span className="mt-1 flex items-start gap-1.5">
                          <MapPin className="mt-0.5 h-3 w-3 shrink-0" /> {c.address}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Date + slot */}
            <div className="surface-card p-7">
              <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Pick a date & time slot</h2>
              <input
                type="date"
                required
                min={tomorrowISO()}
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="mt-4 h-12 w-full rounded-xl border border-border bg-muted px-4 text-sm font-semibold focus:outline-none sm:w-56"
              />
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {slots.map((s) => {
                  const disabled = isPastSlotToday(scheduledDate, s);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => setSlotId(s.id)}
                      className={cn(
                        "flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                        slotId === s.id ? "border-primary bg-primary-soft text-primary" : "border-border hover:border-primary/30",
                      )}
                    >
                      <Clock className="h-4 w-4" /> {s.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Home collection is available from 7:00 AM to 10:00 PM.</p>
            </div>

            {/* Coupon */}
            <div className="surface-card p-7">
              <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Have a coupon?</h2>
              <div className="mt-4 flex gap-2">
                <input
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  placeholder="Enter coupon code"
                  className="h-12 flex-1 rounded-xl border border-border bg-muted px-4 text-sm font-semibold uppercase focus:outline-none"
                />
                <ActionButton type="button" variant="outline" size="md" onClick={applyCoupon} disabled={!couponCode}>
                  Apply
                </ActionButton>
              </div>
              {appliedCoupon && quote && quote.discount > 0 ? (
                <p className="mt-2 text-xs font-bold text-success">Coupon {appliedCoupon} applied — ₹{quote.discount} off</p>
              ) : appliedCoupon && quoteError ? (
                <p className="mt-2 text-xs font-semibold text-destructive">{quoteError}</p>
              ) : null}
            </div>

            {/* Payment method */}
            <div className="surface-card p-7">
              <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">Payment method</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  { id: "ONLINE" as const, icon: CreditCard, label: "Pay online", text: "UPI, card or net banking" },
                  { id: "COD" as const, icon: Wallet, label: "Pay after collection", text: "Cash or UPI to phlebotomist" },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id)}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border p-4 text-left transition-colors",
                      paymentMethod === m.id ? "border-primary bg-primary-soft" : "border-border hover:border-primary/30",
                    )}
                  >
                    <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", paymentMethod === m.id ? "bg-primary text-primary-foreground" : "bg-muted text-primary")}>
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
              <p className="rounded-xl bg-destructive/10 p-4 text-sm font-semibold text-destructive">{submitError}</p>
            ) : null}

            <ActionButton variant="primary" size="lg" className="w-full" type="submit" disabled={!canSubmit || submitting || paying}>
              {paying ? "Waiting for payment…" : submitting ? "Confirming…" : quote ? `Confirm booking · ₹${quote.total}` : "Confirm booking"}
            </ActionButton>
          </div>

          {/* Summary */}
          <aside className="w-full space-y-5 lg:sticky lg:top-24 lg:w-[380px] lg:shrink-0">
            <div className="rounded-[var(--radius-lg)] border border-warning/25 bg-warning/10 p-7 shadow-[var(--shadow-lift)]">
              <span className="rounded-full bg-warning/25 px-3 py-1 text-[11px] font-bold text-foreground uppercase">Booking summary</span>

              <div className="mt-4 space-y-2 border-t border-dashed border-warning/25 pt-4 text-xs">
                {cartItems.map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-3">
                    <span className="min-w-0 truncate text-foreground/85">
                      {item.catalogueItem?.name}
                      {item.familyMemberId ? (
                        <span className="text-muted-foreground"> · {familyMembers.find((m) => m.id === item.familyMemberId)?.name}</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-bold">₹{item.catalogueItem?.price ?? "—"}</span>
                  </div>
                ))}
              </div>

              <div className="mt-3 space-y-2 border-t border-dashed border-warning/25 pt-3 text-xs">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="font-bold">{quote ? `₹${quote.subtotal}` : "—"}</span>
                </div>
                {collectionType === "HOME" && quote?.feeCalculable && quote.distanceKm !== null ? (
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Collection distance</span>
                    <span className="font-bold text-foreground">{quote.distanceKm} km</span>
                  </div>
                ) : null}
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Collection fee</span>
                  {quoteLoading ? (
                    <span className="flex items-center gap-1 font-bold">
                      <Loader2 className="h-3 w-3 animate-spin" /> Calculating…
                    </span>
                  ) : !quote ? (
                    <span className="font-bold">—</span>
                  ) : collectionType === "CENTER" ? (
                    <span className="font-bold text-success">FREE</span>
                  ) : !quote.feeCalculable ? (
                    <span className="font-bold text-warning">To be confirmed</span>
                  ) : !quote.withinRange ? (
                    <span className="font-bold text-warning">₹{quote.collectionFee} (outside standard range)</span>
                  ) : quote.collectionFee === 0 ? (
                    <span className="font-bold text-success">FREE</span>
                  ) : (
                    <span className="font-bold">₹{quote.collectionFee}</span>
                  )}
                </div>
                {collectionType === "HOME" && quote?.feeCalculable && quote.nearestCentreName ? (
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Nearest collection centre</span>
                    <span className="font-bold text-foreground">{quote.nearestCentreName}</span>
                  </div>
                ) : null}
                {quote && quote.discount > 0 ? (
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Coupon discount</span>
                    <span className="font-bold text-success">-₹{quote.discount}</span>
                  </div>
                ) : null}
                {quote && !quote.feeCalculable && collectionType === "HOME" ? (
                  <p className="flex items-start gap-1.5 rounded-lg bg-card/70 p-2.5 text-[11px] text-muted-foreground">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
                    We couldn't determine your exact distance yet — showing ₹0 for now. Add your location above for an
                    accurate fee, or our team will confirm it before collection.
                  </p>
                ) : null}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-warning/25 pt-4">
                <span className="text-sm font-extrabold">Amount payable</span>
                <span className="text-2xl font-extrabold text-primary">{quote ? `₹${quote.total}` : "—"}</span>
              </div>

              <div className="mt-4 flex items-center gap-2 rounded-xl bg-card/70 px-4 py-2.5">
                {collectionType === "HOME" ? <MapPin className="h-4 w-4 shrink-0 text-primary" /> : <Building2 className="h-4 w-4 shrink-0 text-primary" />}
                <p className="text-xs font-semibold text-foreground/80">
                  {collectionType === "HOME"
                    ? addresses.find((a) => a.id === addressId)?.city ?? "Select an address"
                    : centres.find((c) => c.id === collectionCenterId)?.name ?? "Select a centre"}
                </p>
              </div>
              <div className="mt-2 flex items-center gap-2 rounded-xl bg-card/70 px-4 py-2.5">
                <Clock className="h-4 w-4 shrink-0 text-primary" />
                <p className="text-xs font-semibold text-foreground/80">{slots.find((s) => s.id === slotId)?.label ?? "Select a slot"}</p>
              </div>
            </div>

            <div className="rounded-[var(--radius-lg)] border border-success/20 bg-success-soft p-6">
              <p className="flex items-center gap-2 text-sm font-bold">
                <ShieldCheck className="h-4 w-4 text-success" /> Free cancellation up to 2 hrs before your slot
              </p>
              <p className="mt-2 flex items-center gap-2 text-sm font-bold">
                <BadgeCheck className="h-4 w-4 text-success" /> NABL & CAP certified labs
              </p>
              <p className="mt-2 flex items-center gap-2 text-sm font-bold">
                <Check className="h-4 w-4 text-success" /> Certified phlebotomists
              </p>
            </div>
          </aside>
        </form>
      </div>

      <LocationPickerDialog
        open={mapPickerOpen}
        onOpenChange={setMapPickerOpen}
        initial={newAddressCoords}
        onConfirm={handleMapLocationConfirm}
      />
      <LocationPickerDialog
        open={quickFixAddressId !== null}
        onOpenChange={(open) => {
          if (!open) setQuickFixAddressId(null);
        }}
        initial={null}
        onConfirm={(result) => {
          const address = addresses.find((a) => a.id === quickFixAddressId);
          setQuickFixAddressId(null);
          if (address) void handleQuickFixLocationConfirm(address, result);
        }}
      />
    </section>
  );
}
