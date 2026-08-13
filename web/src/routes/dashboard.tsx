import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BriefcaseMedical,
  CalendarCheck,
  Check,
  Clock,
  Download,
  FileCheck2,
  FlaskConical,
  Home as HomeIcon,
  LogOut,
  MapPin,
  Navigation,
  Pencil,
  Phone,
  Plus,
  Settings,
  Sparkles,
  User,
  Users,
  X,
} from "lucide-react";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import {
  apiFileUrl,
  ApiError,
  authApi,
  ordersApi,
  patientsApi,
  session,
  type Address,
  type FamilyMember,
  type NewAddressInput,
  type Order,
  type Profile,
} from "@/lib/api";
import { catalogueApi } from "@/lib/catalogue";
import type { Pkg } from "@/data/site";
import { slugify } from "@/data/site";
import { cn } from "@/lib/utils";
import { ORDER_STATUS_META } from "@/lib/orderStatus";
import { payForOrder } from "@/lib/payment";
import { getCurrentPosition } from "@/lib/geolocation";
import { LocationPickerDialog, type PickedLocation } from "@/components/LocationPickerDialog";

const title = "My Account — MD Path Lab";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [{ title }, { name: "robots", content: "noindex" }],
  }),
  component: DashboardPage,
});

const navSections = [
  { id: "overview", label: "Overview", icon: Sparkles },
  { id: "bookings", label: "My Bookings", icon: CalendarCheck },
  { id: "reports", label: "My Reports", icon: FileCheck2 },
  { id: "family", label: "Family Members", icon: Users },
  { id: "addresses", label: "Saved Addresses", icon: MapPin },
  { id: "recommended", label: "Recommended For You", icon: BriefcaseMedical },
  { id: "profile", label: "Profile & Settings", icon: Settings },
];

function formatDate(iso: string | null) {
  if (!iso) return "Date to be confirmed";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function DashboardPage() {
  const isAuthed = session.getToken() !== null;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [recommended, setRecommended] = useState<Pkg[]>([]);

  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [bookingsTab, setBookingsTab] = useState<"upcoming" | "past">("upcoming");

  const [showAddFamily, setShowAddFamily] = useState(false);
  const [newFamily, setNewFamily] = useState({ name: "", relation: "Self", gender: "", dob: "" });
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [newAddress, setNewAddress] = useState({ label: "Home", line1: "", city: "", pincode: "", phone: "" });
  const [newAddressCoords, setNewAddressCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const [quickFixAddressId, setQuickFixAddressId] = useState<string | null>(null);

  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: "", email: "", gender: "", dob: "", city: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");

  const [changingPhone, setChangingPhone] = useState(false);
  const [phoneStep, setPhoneStep] = useState<"input" | "otp">("input");
  const [newPhone, setNewPhone] = useState("");
  const [phoneOtp, setPhoneOtp] = useState("");
  const [phoneDevCode, setPhoneDevCode] = useState<string | null>(null);
  const [sendingPhoneOtp, setSendingPhoneOtp] = useState(false);
  const [verifyingPhoneOtp, setVerifyingPhoneOtp] = useState(false);
  const [phoneError, setPhoneError] = useState("");

  useEffect(() => {
    if (!isAuthed) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const [me, fam, addr, orderList, packages] = await Promise.all([
          authApi.me(),
          patientsApi.listFamilyMembers(),
          patientsApi.listAddresses(),
          ordersApi.list(),
          catalogueApi.listPackages(),
        ]);
        setProfile(me.user);
        setFamilyMembers(fam);
        setAddresses(addr);
        setOrders(orderList);
        setRecommended(packages.slice(0, 3));
      } catch (err) {
        setLoadError(err instanceof ApiError ? err.message : "Couldn't load your account");
      } finally {
        setLoading(false);
      }
    })();
  }, [isAuthed]);

  const upcomingOrders = orders.filter((o) => !["CANCELLED", "REPORT_READY"].includes(o.status));
  const pastOrders = orders.filter((o) => ["CANCELLED", "REPORT_READY"].includes(o.status));
  const reportsReadyCount = orders.filter((o) => o.status === "REPORT_READY").length;
  const testsBooked = orders.reduce((sum, o) => sum + o.items.length, 0);

  const quickStats = [
    { icon: CalendarCheck, label: "Upcoming tests", value: upcomingOrders.length, tint: "bg-primary-soft text-primary" },
    { icon: FileCheck2, label: "Reports ready", value: reportsReadyCount, tint: "bg-success-soft text-success" },
    { icon: Users, label: "Family members", value: familyMembers.length, tint: "bg-secondary-soft text-secondary" },
    { icon: FlaskConical, label: "Tests booked (lifetime)", value: testsBooked, tint: "bg-warning/15 text-warning" },
  ];

  async function handleAddFamilyMember() {
    if (!newFamily.name.trim() || !newFamily.relation.trim()) {
      setActionError("Enter the patient's name to continue");
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
      setNewFamily({ name: "", relation: "Self", gender: "", dob: "" });
      setShowAddFamily(false);
      setActionError("");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Couldn't add patient profile");
    }
  }

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
      setActionError("");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Couldn't save this location");
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
      setActionError("Enter address line, city and a valid 6-digit pincode to continue");
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
      }
      setShowAddAddress(false);
      resetAddressForm();
      setActionError("");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Couldn't save address");
    }
  }

  async function handleRetryPayment(order: Order) {
    setCancellingId(order.id);
    setActionError("");
    const outcome = await payForOrder(order);
    setCancellingId(null);
    if (outcome.status === "success") {
      setOrders((prev) => prev.map((o) => (o.id === order.id ? outcome.order : o)));
    } else if (outcome.status === "failed") {
      setActionError(`Payment failed — ${outcome.message}`);
    } else if (outcome.status === "error") {
      setActionError(outcome.message);
    }
  }

  function handleStartEditProfile() {
    setProfileForm({
      name: profile?.name ?? "",
      email: profile?.email ?? "",
      gender: profile?.gender ?? "",
      dob: profile?.dob ? profile.dob.slice(0, 10) : "",
      city: profile?.city ?? "",
    });
    setProfileError("");
    setEditingProfile(true);
  }

  async function handleSaveProfile() {
    if (!profileForm.name.trim()) {
      setProfileError("Enter your name to continue");
      return;
    }
    setSavingProfile(true);
    setProfileError("");
    try {
      const res = await authApi.completeProfile({
        name: profileForm.name.trim(),
        ...(profileForm.email.trim() ? { email: profileForm.email.trim() } : {}),
        ...(profileForm.gender ? { gender: profileForm.gender as "MALE" | "FEMALE" | "OTHER" } : {}),
        ...(profileForm.dob ? { dob: profileForm.dob } : {}),
        ...(profileForm.city.trim() ? { city: profileForm.city.trim() } : {}),
      });
      session.save(session.getToken()!, res.user);
      const me = await authApi.me();
      setProfile(me.user);
      setEditingProfile(false);
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : "Couldn't save your profile");
    } finally {
      setSavingProfile(false);
    }
  }

  function handleStartChangePhone() {
    setNewPhone("");
    setPhoneOtp("");
    setPhoneDevCode(null);
    setPhoneError("");
    setPhoneStep("input");
    setChangingPhone(true);
  }

  async function handleSendPhoneOtp() {
    if (!/^[6-9]\d{9}$/.test(newPhone)) {
      setPhoneError("Enter a valid 10-digit mobile number");
      return;
    }
    setSendingPhoneOtp(true);
    setPhoneError("");
    try {
      const res = await authApi.requestPhoneChangeOtp(newPhone);
      setPhoneDevCode(res.devCode ?? null);
      setPhoneStep("otp");
    } catch (err) {
      setPhoneError(err instanceof ApiError ? err.message : "Couldn't send OTP — please try again");
    } finally {
      setSendingPhoneOtp(false);
    }
  }

  async function handleVerifyPhoneOtp() {
    if (phoneOtp.length !== 6) {
      setPhoneError("Enter the complete 6-digit code");
      return;
    }
    setVerifyingPhoneOtp(true);
    setPhoneError("");
    try {
      const res = await authApi.verifyPhoneChangeOtp(newPhone, phoneOtp);
      session.save(res.accessToken, res.user);
      const me = await authApi.me();
      setProfile(me.user);
      setChangingPhone(false);
    } catch (err) {
      setPhoneError(err instanceof ApiError ? err.message : "Couldn't verify OTP — please try again");
    } finally {
      setVerifyingPhoneOtp(false);
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
            <h1 className="mt-5 text-xl font-extrabold">Log in to view your account</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Track bookings, manage family profiles and view reports once they're ready.
            </p>
            <Link to="/login" search={{ redirect: "/dashboard" }} className="mt-6 block">
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
        <div className="container-page mx-auto max-w-md text-center text-sm text-muted-foreground">
          Loading your account…
        </div>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="py-16">
        <div className="container-page mx-auto max-w-md text-center text-sm font-semibold text-destructive">
          {loadError}
        </div>
      </section>
    );
  }

  return (
    <section className="py-6 lg:py-8">
      <div className="container-page flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Sidebar */}
        <aside className="w-full shrink-0 space-y-4 lg:sticky lg:top-20 lg:w-64">
          <div className="surface-card p-5 text-center">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-primary text-lg font-extrabold text-primary-foreground">
              {profile?.name ? profile.name.slice(0, 2).toUpperCase() : <User className="h-6 w-6" />}
            </span>
            <p className="mt-3 text-sm font-extrabold">{profile?.name ?? "Complete your profile"}</p>
            <p className="text-xs text-muted-foreground">+91 {profile?.phone}</p>
          </div>

          <nav className="surface-card p-2">
            {navSections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-foreground/80 transition-colors hover:bg-primary-soft hover:text-primary"
              >
                <s.icon className="h-4 w-4 shrink-0" />
                {s.label}
              </a>
            ))}
            <div className="my-1 border-t border-border" />
            <button
              onClick={() => {
                session.clear();
                window.location.href = "/";
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-destructive/85 transition-colors hover:bg-destructive/10"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              Log out
            </button>
          </nav>

          <div className="rounded-[var(--radius-lg)] border border-success/20 bg-success-soft p-5">
            <p className="text-sm font-bold">Need help?</p>
            <p className="mt-1 text-xs text-muted-foreground">Talk to our health advisors, 24x7.</p>
            <a href="tel:18001122333" className="mt-3 flex items-center gap-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-card text-success">
                <Phone className="h-4 w-4" />
              </span>
              <span className="text-sm font-bold">1800-112-2333</span>
            </a>
          </div>
        </aside>

        {/* Main */}
        <div className="min-w-0 flex-1 space-y-8">
          <div
            id="overview"
            className="scroll-mt-24 overflow-hidden rounded-[var(--radius-xl)] bg-gradient-to-br from-primary to-secondary p-6 text-primary-foreground sm:p-7"
          >
            <p className="text-xs font-semibold text-primary-foreground/75">Welcome back,</p>
            <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">{profile?.name ?? "there"}</h1>
            <p className="mt-2 max-w-md text-sm text-primary-foreground/80">
              {upcomingOrders.length > 0
                ? `You have ${upcomingOrders.length} upcoming ${upcomingOrders.length === 1 ? "booking" : "bookings"}.`
                : "You don't have any upcoming bookings yet."}
            </p>
            <Link to="/tests" className="mt-4 inline-block">
              <ActionButton variant="light" size="md">
                <Plus className="h-4 w-4" /> Book a test
              </ActionButton>
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {quickStats.map((s) => (
              <div key={s.label} className="surface-card flex items-center gap-3 p-4">
                <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", s.tint)}>
                  <s.icon className="h-4.5 w-4.5" />
                </span>
                <div>
                  <p className="text-xl font-extrabold">{s.value}</p>
                  <p className="text-[11px] font-semibold text-muted-foreground">{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          {actionError ? (
            <p className="rounded-xl bg-destructive/10 p-4 text-sm font-semibold text-destructive">{actionError}</p>
          ) : null}

          {/* Bookings */}
          <div id="bookings" className="scroll-mt-24 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold">My Bookings</h2>
              <div className="flex gap-1.5 rounded-full bg-muted p-1">
                {(["upcoming", "past"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setBookingsTab(tab)}
                    className={cn(
                      "rounded-full px-4 py-1.5 text-xs font-bold capitalize transition-colors",
                      bookingsTab === tab ? "bg-card text-primary shadow-sm" : "text-muted-foreground",
                    )}
                  >
                    {tab} ({tab === "upcoming" ? upcomingOrders.length : pastOrders.length})
                  </button>
                ))}
              </div>
            </div>

            {(bookingsTab === "upcoming" ? upcomingOrders : pastOrders).length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {(bookingsTab === "upcoming" ? upcomingOrders : pastOrders).map((o) => {
                  const needsRetry = o.paymentMethod === "ONLINE" && o.paymentStatus !== "PAID" && o.status !== "CANCELLED";
                  return (
                    <div key={o.id} className="surface-card overflow-hidden p-0">
                      <div className="flex items-center justify-between gap-3 border-b border-dashed border-border p-5 pb-4">
                        <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold uppercase", ORDER_STATUS_META[o.status].tint)}>
                          {ORDER_STATUS_META[o.status].label}
                        </span>
                        <span className="text-sm font-extrabold text-primary">₹{o.total}</span>
                      </div>
                      <div className="space-y-3 p-5 pt-4">
                        <h3 className="text-sm font-extrabold">{o.items.map((i) => i.itemName).join(", ")}</h3>
                        <p className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3.5 w-3.5 shrink-0" /> {formatDate(o.scheduledDate)}
                          {o.slot ? ` · ${o.slot.label}` : ""}
                        </p>
                        {o.address ? (
                          <p className="flex items-center gap-2 text-xs text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5 shrink-0" /> {o.address.line1}, {o.address.city}
                          </p>
                        ) : null}
                        <div className="flex gap-2 pt-1">
                          <Link to="/booking/$orderId" params={{ orderId: o.id }} className="flex-1">
                            <ActionButton variant="outline" size="sm" className="w-full">
                              View details
                            </ActionButton>
                          </Link>
                          {needsRetry ? (
                            <ActionButton
                              type="button"
                              variant="primary"
                              size="sm"
                              className="flex-1"
                              onClick={() => handleRetryPayment(o)}
                              disabled={cancellingId === o.id}
                            >
                              {cancellingId === o.id ? "Opening…" : "Retry payment"}
                            </ActionButton>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="surface-card p-6 text-sm text-muted-foreground">
                {bookingsTab === "upcoming" ? "No upcoming bookings yet." : "No past bookings yet."}
              </p>
            )}
          </div>

          {/* Reports */}
          <div id="reports" className="surface-card scroll-mt-24 p-0">
            <div className="border-b border-border p-6 pb-5">
              <h2 className="text-lg font-extrabold">My Reports</h2>
            </div>
            {orders.some((o) => o.reports.length > 0) ? (
              <div className="p-2">
                {orders.flatMap((o) =>
                  o.reports.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 rounded-xl p-4 transition-colors hover:bg-muted">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-success-soft text-success">
                        <FileCheck2 className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{o.items.map((i) => i.itemName).join(", ")}</p>
                        <p className="text-xs text-muted-foreground">Ready · {formatDate(r.approvedAt)}</p>
                      </div>
                      <a
                        href={apiFileUrl(r.fileUrl)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Download report for ${o.orderNumber}`}
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                      >
                        <Download className="h-4.5 w-4.5" />
                      </a>
                    </div>
                  )),
                )}
              </div>
            ) : (
              <p className="p-6 pt-0 text-sm text-muted-foreground">
                No reports yet — they'll show up here once a sample has been collected and processed.
              </p>
            )}
          </div>

          {/* Family */}
          <div id="family" className="scroll-mt-24 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold">Family Members</h2>
              <button
                type="button"
                onClick={() => setShowAddFamily((v) => !v)}
                className="flex items-center gap-1 text-xs font-bold text-primary hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {familyMembers.map((m) => (
                <div key={m.id} className="surface-card p-4">
                  <div className="flex items-center gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                      {m.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{m.name}</p>
                      <p className="text-xs text-muted-foreground">{m.relation}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {showAddFamily ? (
              <div className="surface-card grid gap-3 p-4 sm:grid-cols-2">
                <input
                  value={newFamily.name}
                  onChange={(e) => setNewFamily((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Full name"
                  className="h-11 rounded-lg border border-border bg-muted px-3 text-sm font-medium focus:outline-none"
                />
                <select
                  value={newFamily.relation}
                  onChange={(e) => setNewFamily((f) => ({ ...f, relation: e.target.value }))}
                  className="h-11 rounded-lg border border-border bg-muted px-3 text-sm font-semibold focus:outline-none"
                >
                  {["Self", "Spouse", "Child", "Parent", "Other"].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
                <ActionButton type="button" onClick={handleAddFamilyMember} variant="primary" size="sm" className="sm:col-span-2">
                  Save patient
                </ActionButton>
              </div>
            ) : null}
          </div>

          {/* Addresses */}
          <div id="addresses" className="scroll-mt-24 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold">Saved Addresses</h2>
              <button
                type="button"
                onClick={() => {
                  resetAddressForm();
                  setShowAddAddress((v) => !v);
                }}
                className="flex items-center gap-1 text-xs font-bold text-primary hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {addresses.map((a) => (
                <div key={a.id} className="surface-card relative p-4">
                  <span className="flex items-center gap-2 text-sm font-extrabold">
                    <HomeIcon className="h-4 w-4 text-primary" /> {a.label ?? "Address"}
                    {a.isDefault ? (
                      <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-bold text-primary">
                        Default
                      </span>
                    ) : null}
                  </span>
                  <p className="mt-2 pr-6 text-xs leading-relaxed text-muted-foreground">
                    {a.line1}, {a.city} {a.pincode}
                  </p>
                  {a.lat && a.lng ? (
                    <p className="mt-1 flex items-center gap-1 text-[10px] font-bold text-success">
                      <Check className="h-3 w-3" /> Location confirmed
                    </p>
                  ) : (
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-bold text-warning">
                      Location not confirmed
                      <button
                        type="button"
                        onClick={() => {
                          setActionError("");
                          setQuickFixAddressId(a.id);
                        }}
                        className="cursor-pointer underline hover:text-primary"
                      >
                        [Choose Location]
                      </button>
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => handleStartEditAddress(a)}
                    aria-label="Edit address"
                    className="absolute top-3 right-3 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-primary"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            {addresses.length === 0 ? (
              <p className="text-sm text-muted-foreground">No saved addresses yet.</p>
            ) : null}
            {showAddAddress ? (
              <div className="surface-card grid gap-3 p-4 sm:grid-cols-2">
                <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase sm:col-span-2">
                  {editingAddressId ? "Edit address" : "New address"}
                </p>
                <input
                  value={newAddress.label}
                  onChange={(e) => setNewAddress((a) => ({ ...a, label: e.target.value }))}
                  placeholder="Label (e.g. Home)"
                  className="h-11 rounded-lg border border-border bg-muted px-3 text-sm font-medium focus:outline-none sm:col-span-2"
                />
                <input
                  value={newAddress.line1}
                  onChange={(e) => setNewAddress((a) => ({ ...a, line1: e.target.value }))}
                  placeholder="House / street / landmark"
                  className="h-11 rounded-lg border border-border bg-muted px-3 text-sm font-medium focus:outline-none sm:col-span-2"
                />
                <input
                  value={newAddress.city}
                  onChange={(e) => setNewAddress((a) => ({ ...a, city: e.target.value }))}
                  placeholder="City"
                  className="h-11 rounded-lg border border-border bg-muted px-3 text-sm font-medium focus:outline-none"
                />
                <input
                  inputMode="numeric"
                  value={newAddress.pincode}
                  onChange={(e) => setNewAddress((a) => ({ ...a, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                  placeholder="Pincode"
                  className="h-11 rounded-lg border border-border bg-muted px-3 text-sm font-medium focus:outline-none"
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

          {/* Recommended */}
          <div id="recommended" className="scroll-mt-24 space-y-4">
            <h2 className="text-lg font-extrabold">Recommended For You</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {recommended.map((p) => {
                const slug = slugify(p.name);
                const discount = Math.round(100 - (p.price / p.mrp) * 100);
                return (
                  <Link key={slug} to="/packages/$slug" params={{ slug }} className="surface-card lift-on-hover block p-4">
                    {p.badge ? (
                      <span className="rounded-full bg-primary-soft px-2.5 py-1 text-[10px] font-bold text-primary">
                        {p.badge}
                      </span>
                    ) : null}
                    <h3 className="mt-2 text-sm font-extrabold">{p.name.replace(/^MD Path Lab\s*/i, "")}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{p.parameters} parameters</p>
                    <p className="mt-3 flex items-baseline gap-2">
                      <span className="text-lg font-extrabold text-primary">₹{p.price}</span>
                      <span className="text-xs text-muted-foreground line-through">₹{p.mrp}</span>
                      <span className="text-xs font-bold text-success">{discount}% off</span>
                    </p>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Profile */}
          <div id="profile" className="surface-card scroll-mt-24 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold">Profile & Settings</h2>
              {!editingProfile ? (
                <button
                  type="button"
                  onClick={handleStartEditProfile}
                  className="flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit profile
                </button>
              ) : null}
            </div>

            {profileError ? (
              <p className="mt-3 rounded-xl bg-destructive/10 p-3 text-xs font-semibold text-destructive">{profileError}</p>
            ) : null}

            {!editingProfile ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="border-b border-dashed border-border pb-3">
                  <p className="text-[11px] font-semibold text-muted-foreground">Full name</p>
                  <p className="mt-1 text-sm font-bold">{profile?.name ?? "Not set"}</p>
                </div>
                <div className="border-b border-dashed border-border pb-3">
                  <p className="text-[11px] font-semibold text-muted-foreground">Mobile number</p>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="text-sm font-bold">{profile?.phone ? `+91 ${profile.phone}` : "Not set"}</p>
                    <button
                      type="button"
                      onClick={handleStartChangePhone}
                      className="text-xs font-bold text-primary hover:underline"
                    >
                      Change
                    </button>
                  </div>
                </div>
                <div className="border-b border-dashed border-border pb-3">
                  <p className="text-[11px] font-semibold text-muted-foreground">Email address</p>
                  <p className="mt-1 text-sm font-bold">{profile?.email ?? "Not set"}</p>
                </div>
                <div className="border-b border-dashed border-border pb-3">
                  <p className="text-[11px] font-semibold text-muted-foreground">Date of birth</p>
                  <p className="mt-1 text-sm font-bold">{profile?.dob ? formatDate(profile.dob) : "Not set"}</p>
                </div>
                <div className="border-b border-dashed border-border pb-3">
                  <p className="text-[11px] font-semibold text-muted-foreground">Gender</p>
                  <p className="mt-1 text-sm font-bold">{profile?.gender ?? "Not set"}</p>
                </div>
                <div className="border-b border-dashed border-border pb-3">
                  <p className="text-[11px] font-semibold text-muted-foreground">City</p>
                  <p className="mt-1 text-sm font-bold">{profile?.city ?? "Not set"}</p>
                </div>
              </div>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-[11px] font-bold tracking-wide text-muted-foreground uppercase">Full name *</span>
                  <input
                    value={profileForm.name}
                    onChange={(e) => setProfileForm((f) => ({ ...f, name: e.target.value }))}
                    className="h-11 w-full rounded-lg border border-border bg-muted px-3 text-sm font-medium focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-bold tracking-wide text-muted-foreground uppercase">Email</span>
                  <input
                    type="email"
                    value={profileForm.email}
                    onChange={(e) => setProfileForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="you@example.com"
                    className="h-11 w-full rounded-lg border border-border bg-muted px-3 text-sm font-medium focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-bold tracking-wide text-muted-foreground uppercase">Date of birth</span>
                  <input
                    type="date"
                    value={profileForm.dob}
                    onChange={(e) => setProfileForm((f) => ({ ...f, dob: e.target.value }))}
                    className="h-11 w-full rounded-lg border border-border bg-muted px-3 text-sm font-medium focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-bold tracking-wide text-muted-foreground uppercase">Gender</span>
                  <select
                    value={profileForm.gender}
                    onChange={(e) => setProfileForm((f) => ({ ...f, gender: e.target.value }))}
                    className="h-11 w-full rounded-lg border border-border bg-muted px-3 text-sm font-semibold focus:outline-none"
                  >
                    <option value="">Prefer not to say</option>
                    <option value="FEMALE">Female</option>
                    <option value="MALE">Male</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-bold tracking-wide text-muted-foreground uppercase">City</span>
                  <input
                    value={profileForm.city}
                    onChange={(e) => setProfileForm((f) => ({ ...f, city: e.target.value }))}
                    placeholder="e.g. Kanpur"
                    className="h-11 w-full rounded-lg border border-border bg-muted px-3 text-sm font-medium focus:outline-none"
                  />
                </label>
                <div className="flex gap-2 sm:col-span-2">
                  <ActionButton type="button" onClick={handleSaveProfile} variant="primary" size="sm" disabled={savingProfile} className="flex-1">
                    {savingProfile ? "Saving…" : "Save changes"}
                  </ActionButton>
                  <ActionButton type="button" onClick={() => setEditingProfile(false)} variant="outline" size="sm">
                    Cancel
                  </ActionButton>
                </div>
              </div>
            )}

            {changingPhone ? (
              <div className="mt-5 rounded-xl bg-muted p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Change mobile number</p>
                  <button type="button" onClick={() => setChangingPhone(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {phoneError ? <p className="mt-2 text-xs font-semibold text-destructive">{phoneError}</p> : null}

                {phoneStep === "input" ? (
                  <div className="mt-3 flex flex-col gap-2.5 sm:flex-row">
                    <div className="flex h-11 flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3">
                      <span className="text-sm font-bold text-muted-foreground">+91</span>
                      <input
                        inputMode="numeric"
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                        placeholder="New 10-digit mobile number"
                        className="w-full bg-transparent text-sm font-semibold focus:outline-none"
                      />
                    </div>
                    <ActionButton type="button" onClick={handleSendPhoneOtp} variant="primary" size="sm" disabled={sendingPhoneOtp}>
                      {sendingPhoneOtp ? "Sending…" : "Send OTP"}
                    </ActionButton>
                  </div>
                ) : (
                  <div className="mt-3 space-y-2.5">
                    <p className="text-xs text-muted-foreground">
                      Enter the 6-digit code sent to <span className="font-bold text-foreground">+91 {newPhone}</span>
                    </p>
                    {phoneDevCode ? (
                      <p className="text-xs font-semibold text-warning">Dev mode — OTP is {phoneDevCode}</p>
                    ) : null}
                    <div className="flex flex-col gap-2.5 sm:flex-row">
                      <input
                        inputMode="numeric"
                        value={phoneOtp}
                        onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="6-digit code"
                        className="h-11 flex-1 rounded-lg border border-border bg-card px-3 text-sm font-semibold tracking-widest focus:outline-none"
                      />
                      <ActionButton type="button" onClick={handleVerifyPhoneOtp} variant="primary" size="sm" disabled={verifyingPhoneOtp}>
                        {verifyingPhoneOtp ? "Verifying…" : "Verify & update"}
                      </ActionButton>
                    </div>
                    <button type="button" onClick={() => setPhoneStep("input")} className="text-xs font-bold text-primary hover:underline">
                      Change number
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-1.5 px-1 text-xs">
            <Check className="h-3.5 w-3.5 text-success" />
            <span className="text-muted-foreground">Reports verified by MD Pathologists</span>
          </div>
        </div>
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
