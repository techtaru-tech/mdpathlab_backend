import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import {
  BriefcaseMedical,
  CalendarCheck,
  Check,
  ChevronRight,
  Clock,
  Copy,
  Download,
  FileCheck2,
  FileText,
  FlaskConical,
  Gift,
  Home as HomeIcon,
  LayoutGrid,
  LogOut,
  MapPin,
  Navigation,
  Pencil,
  Phone,
  Plus,
  Settings,
  Ticket,
  User,
  Users,
  Wallet as WalletIcon,
  X,
} from "lucide-react";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import {
  apiFileUrl,
  ApiError,
  authApi,
  couponsApi,
  notificationsApi,
  ordersApi,
  patientsApi,
  prescriptionsApi,
  session,
  walletApi,
  type Address,
  type Coupon,
  type FamilyMember,
  type NewAddressInput,
  type Order,
  type Prescription,
  type Profile,
  type WalletTransaction,
} from "@/lib/api";
import { listenForForegroundPush, requestPushToken } from "@/lib/firebase";
import { catalogueApi } from "@/lib/catalogue";
import type { Pkg } from "@/data/site";
import { slugify } from "@/data/site";
import { cn } from "@/lib/utils";
import { ORDER_STATUS_META } from "@/lib/orderStatus";
import { payForOrder } from "@/lib/payment";
import { getCurrentPosition } from "@/lib/geolocation";
import { LocationPickerDialog, type PickedLocation } from "@/components/LocationPickerDialog";
import { useAuthed } from "@/lib/useAuthed";
import { addMoneyToWallet } from "@/lib/walletTopup";

const title = "My Account — MD Path Lab";

export const Route = createFileRoute("/dashboard")({
  // Which section's panel is open — undefined means the landing card grid. Kept in the URL (not
  // just component state) so a section is bookmarkable/shareable/back-button-able, e.g. after a
  // booking redirects here with ?section=bookings.
  validateSearch: z.object({ section: z.string().optional() }),
  head: () => ({
    meta: [{ title }, { name: "robots", content: "noindex" }],
  }),
  component: DashboardPage,
});

const navSections = [
  { id: "bookings", label: "My Bookings", icon: CalendarCheck },
  { id: "reports", label: "My Reports", icon: FileCheck2 },
  { id: "wallet", label: "Wallet", icon: WalletIcon },
  { id: "coupons", label: "My Coupons", icon: Ticket },
  { id: "prescriptions", label: "My Prescriptions", icon: FileText },
  { id: "family", label: "Family Members", icon: Users },
  { id: "addresses", label: "Saved Addresses", icon: MapPin },
  { id: "recommended", label: "Recommended For You", icon: BriefcaseMedical },
  { id: "profile", label: "Profile & Settings", icon: Settings },
] as const;

/** The colored header bar + white panel every section opens into — mirrors the reference platform's per-section page shell. */
function SectionShell({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-xl)] border border-border">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-primary px-6 py-4 text-primary-foreground">
        <h1 className="text-base font-extrabold sm:text-lg">{title}</h1>
        {actions}
      </div>
      <div className="bg-card p-6">{children}</div>
    </div>
  );
}

/** One clickable tile on the landing grid. */
function DashboardTile({
  icon: Icon,
  label,
  stat,
  tint,
  onClick,
}: {
  icon: typeof CalendarCheck;
  label: string;
  stat?: string | undefined;
  tint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="surface-card lift-on-hover flex flex-col items-center gap-3 p-6 text-center"
    >
      <span className={cn("grid h-14 w-14 shrink-0 place-items-center rounded-2xl", tint)}>
        <Icon className="h-6 w-6" />
      </span>
      <span className="text-sm font-extrabold">{label}</span>
      {stat ? <span className="text-xs font-semibold text-muted-foreground">{stat}</span> : null}
    </button>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return "Date to be confirmed";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function DashboardPage() {
  const isAuthed = useAuthed();
  const { section: activeSection } = Route.useSearch();
  const navigate = Route.useNavigate();
  function goToSection(id: string | undefined) {
    navigate({ search: id ? { section: id } : {} });
  }

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [recommended, setRecommended] = useState<Pkg[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletTransactions, setWalletTransactions] = useState<WalletTransaction[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const [showAddMoney, setShowAddMoney] = useState(false);
  const [addMoneyAmount, setAddMoneyAmount] = useState("");
  const [addingMoney, setAddingMoney] = useState(false);
  const [addMoneyError, setAddMoneyError] = useState("");

  const [activateCode, setActivateCode] = useState("");
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState("");
  const [activatedCoupon, setActivatedCoupon] = useState<Coupon | null>(null);

  const [showUploadPrescription, setShowUploadPrescription] = useState(false);
  const [prescriptionFile, setPrescriptionFile] = useState<File | null>(null);
  const [prescriptionNote, setPrescriptionNote] = useState("");
  const [uploadingPrescription, setUploadingPrescription] = useState(false);
  const [prescriptionError, setPrescriptionError] = useState("");

  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [bookingsTab, setBookingsTab] = useState<"upcoming" | "past">("upcoming");

  const [showAddFamily, setShowAddFamily] = useState(false);
  const [newFamily, setNewFamily] = useState({ name: "", relation: "Self", gender: "", age: "" });
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
    if (isAuthed === null) return; // still resolving — wait rather than flash "please log in"
    if (isAuthed === false) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const [me, fam, addr, orderList, packages, prescriptionList] = await Promise.all([
          authApi.me(),
          patientsApi.listFamilyMembers(),
          patientsApi.listAddresses(),
          ordersApi.list(),
          catalogueApi.listPackages(),
          prescriptionsApi.listMine(),
        ]);
        setProfile(me.user);
        setFamilyMembers(fam);
        setAddresses(addr);
        setOrders(orderList);
        setRecommended(packages.slice(0, 3));
        setPrescriptions(prescriptionList);
      } catch (err) {
        setLoadError(err instanceof ApiError ? err.message : "Couldn't load your account");
      } finally {
        setLoading(false);
      }

      // Best-effort — a denied/unsupported/unconfigured browser just means no push for this
      // session, never a reason to block the rest of the dashboard from loading.
      requestPushToken()
        .then((token) => (token ? notificationsApi.registerDeviceToken(token) : null))
        .catch(() => {});
      listenForForegroundPush();

      // Loaded separately, non-blocking — neither should hold up the rest of the dashboard.
      walletApi
        .get()
        .then((w) => {
          setWalletBalance(w.balance);
          setWalletTransactions(w.transactions);
        })
        .catch(() => {});
      couponsApi.list().then(setCoupons).catch(() => {});
    })();
  }, [isAuthed]);

  const upcomingOrders = orders.filter((o) => !["CANCELLED", "REPORT_READY"].includes(o.status));
  const pastOrders = orders.filter((o) => ["CANCELLED", "REPORT_READY"].includes(o.status));
  const reportsReadyCount = orders.filter((o) => o.status === "REPORT_READY").length;
  const testsBooked = orders.reduce((sum, o) => sum + o.items.length, 0);

  const quickStats = [
    { icon: CalendarCheck, label: "Upcoming tests", value: String(upcomingOrders.length), tint: "bg-primary-soft text-primary" },
    { icon: FileCheck2, label: "Reports ready", value: String(reportsReadyCount), tint: "bg-success-soft text-success" },
    { icon: WalletIcon, label: "Wallet balance", value: `₹${walletBalance}`, tint: "bg-secondary-soft text-secondary" },
    { icon: Users, label: "Family members", value: String(familyMembers.length), tint: "bg-warning/15 text-warning" },
    { icon: FlaskConical, label: "Tests booked (lifetime)", value: String(testsBooked), tint: "bg-primary-soft text-primary" },
  ];

  async function handleCopyCoupon(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode((c) => (c === code ? null : c)), 2000);
    } catch {
      // clipboard access denied/unsupported — nothing to fall back to, just skip the "Copied" feedback
    }
  }

  async function handleAddMoney() {
    const amount = Number(addMoneyAmount);
    if (!Number.isInteger(amount) || amount < 10) {
      setAddMoneyError("Enter an amount of at least ₹10");
      return;
    }
    setAddingMoney(true);
    setAddMoneyError("");
    const outcome = await addMoneyToWallet(amount);
    setAddingMoney(false);
    if (outcome.status === "success") {
      setWalletBalance(outcome.balance);
      setWalletTransactions(outcome.transactions);
      setShowAddMoney(false);
      setAddMoneyAmount("");
    } else if (outcome.status === "failed") {
      setAddMoneyError(`Payment failed — ${outcome.message}`);
    } else if (outcome.status === "error") {
      setAddMoneyError(outcome.message);
    }
    // "cancelled" (user closed the Razorpay modal) — leave the form open, no error to show.
  }

  async function handleActivateCoupon() {
    if (!activateCode.trim()) {
      setActivateError("Enter a coupon code");
      return;
    }
    setActivating(true);
    setActivateError("");
    setActivatedCoupon(null);
    try {
      const coupon = await couponsApi.activate(activateCode.trim().toUpperCase());
      setActivatedCoupon(coupon);
      setActivateCode("");
      // The activated code may not already be in the public "active coupons" list shown below
      // (e.g. a private code shared just with this user) — surface it there too if it's new.
      setCoupons((prev) => (prev.some((c) => c.id === coupon.id) ? prev : [coupon, ...prev]));
    } catch (err) {
      setActivateError(err instanceof ApiError ? err.message : "Couldn't activate this coupon");
    } finally {
      setActivating(false);
    }
  }

  async function handleAddFamilyMember() {
    if (!newFamily.name.trim() || !newFamily.relation.trim()) {
      setActionError("Enter the patient's name to continue");
      return;
    }
    const age = newFamily.age.trim() ? Number(newFamily.age) : undefined;
    if (age !== undefined && (!Number.isInteger(age) || age < 0 || age > 120)) {
      setActionError("Enter a valid age");
      return;
    }
    try {
      const created = await patientsApi.addFamilyMember({
        name: newFamily.name,
        relation: newFamily.relation,
        ...(newFamily.gender ? { gender: newFamily.gender } : {}),
        ...(age !== undefined ? { age } : {}),
      });
      setFamilyMembers((prev) => [...prev, created]);
      setNewFamily({ name: "", relation: "Self", gender: "", age: "" });
      setShowAddFamily(false);
      setActionError("");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Couldn't add patient profile");
    }
  }

  async function handleUploadPrescription() {
    if (!prescriptionFile) {
      setPrescriptionError("Choose a prescription file to upload");
      return;
    }
    setUploadingPrescription(true);
    setPrescriptionError("");
    try {
      const created = await prescriptionsApi.upload(prescriptionFile, prescriptionNote.trim() ? { note: prescriptionNote.trim() } : undefined);
      setPrescriptions((prev) => [created, ...prev]);
      setPrescriptionFile(null);
      setPrescriptionNote("");
      setShowUploadPrescription(false);
    } catch (err) {
      setPrescriptionError(err instanceof ApiError ? err.message : "Couldn't upload prescription");
    } finally {
      setUploadingPrescription(false);
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

  if (isAuthed === false) {
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

  // Passbook — a running balance per row, computed backwards from the current balance since
  // `walletTransactions` is newest-first. Row 0's balanceAfter is the current balance; each older
  // row's balanceAfter is derived by undoing the row above it.
  let runningBalance = walletBalance;
  const passbookRows = walletTransactions.map((t) => {
    const row = { ...t, balanceAfter: runningBalance };
    runningBalance -= t.type === "CREDIT" ? t.amount : -t.amount;
    return row;
  });

  const tileStats: Record<string, string | undefined> = {
    bookings: `${upcomingOrders.length} upcoming`,
    reports: `${reportsReadyCount} ready`,
    wallet: `₹${walletBalance} balance`,
    coupons: `${coupons.length} active`,
    prescriptions: `${prescriptions.length} uploaded`,
    family: `${familyMembers.length} added`,
    addresses: `${addresses.length} saved`,
    recommended: undefined,
  };
  const tileTints = [
    "bg-primary-soft text-primary",
    "bg-secondary-soft text-secondary",
    "bg-success-soft text-success",
    "bg-warning/15 text-warning",
  ];
  const initials = profile?.name ? profile.name.slice(0, 2).toUpperCase() : <User className="h-6 w-6" />;

  function goToEditProfile() {
    handleStartEditProfile();
    goToSection("profile");
  }

  return (
    <section className="py-6 lg:py-10">
      <div className="container-page">
        {!activeSection ? (
          // ---------- Landing: card grid (Healthians-style), our own sections ----------
          <div className="space-y-8">
            <div className="overflow-hidden rounded-[var(--radius-xl)] bg-gradient-to-br from-primary to-secondary p-6 text-primary-foreground sm:p-7">
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

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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

            <div>
              <h2 className="text-sm font-extrabold tracking-wide text-muted-foreground uppercase">My Dashboard</h2>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {/* Profile card — its own tile, orange like the reference, doubles as the "Edit Info" entry point */}
                <button
                  type="button"
                  onClick={goToEditProfile}
                  className="lift-on-hover flex flex-col items-center gap-2 rounded-[var(--radius-lg)] bg-gradient-to-br from-secondary to-primary p-6 text-center text-secondary-foreground"
                >
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-card/20 text-lg font-extrabold">
                    {initials}
                  </span>
                  <span className="text-sm font-extrabold">{profile?.name ?? "Complete your profile"}</span>
                  <span className="text-xs text-secondary-foreground/80">+91 {profile?.phone}</span>
                  <span className="mt-1 rounded-full bg-card/20 px-3 py-1 text-xs font-bold">Edit Info</span>
                </button>

                {navSections
                  .filter((s) => s.id !== "profile")
                  .map((s, i) =>
                    s.id === "family" ? (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => goToSection(s.id)}
                        className="lift-on-hover flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-primary/20 bg-primary-soft p-6 text-center"
                      >
                        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-card text-primary">
                          <s.icon className="h-6 w-6" />
                        </span>
                        <span className="text-sm font-extrabold">{s.label}</span>
                        <span className="text-xs font-semibold text-primary">Book tests for them too</span>
                      </button>
                    ) : (
                      <DashboardTile
                        key={s.id}
                        icon={s.icon}
                        label={s.label}
                        stat={tileStats[s.id]}
                        tint={tileTints[i % tileTints.length]!}
                        onClick={() => goToSection(s.id)}
                      />
                    ),
                  )}
              </div>
            </div>
          </div>
        ) : (
          // ---------- Section view: sidebar + colored panel (Healthians-style sub-page) ----------
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <aside className="w-full shrink-0 space-y-4 lg:sticky lg:top-20 lg:w-64">
              <div className="surface-card p-5 text-center">
                <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-primary text-lg font-extrabold text-primary-foreground">
                  {initials}
                </span>
                <p className="mt-3 text-sm font-extrabold">{profile?.name ?? "Complete your profile"}</p>
                <p className="text-xs text-muted-foreground">{profile?.email}</p>
                <p className="text-xs text-muted-foreground">+91 {profile?.phone}</p>
                <button
                  type="button"
                  onClick={goToEditProfile}
                  className="mt-3 rounded-full bg-secondary px-4 py-1.5 text-xs font-bold text-secondary-foreground"
                >
                  Edit Info
                </button>
              </div>

              <nav className="surface-card p-2">
                <button
                  type="button"
                  onClick={() => goToSection(undefined)}
                  className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-semibold text-foreground/80 transition-colors hover:bg-primary-soft hover:text-primary"
                >
                  <LayoutGrid className="h-4 w-4 shrink-0" />
                  Dashboard
                </button>
                <div className="my-1 border-t border-border" />
                {navSections.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => goToSection(s.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm font-semibold transition-colors",
                      activeSection === s.id ? "bg-primary-soft text-primary" : "text-foreground/80 hover:bg-primary-soft hover:text-primary",
                    )}
                  >
                    <s.icon className="h-4 w-4 shrink-0" />
                    {s.label}
                  </button>
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

            <div className="min-w-0 flex-1 space-y-4">
              <button
                type="button"
                onClick={() => goToSection(undefined)}
                className="flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-primary lg:hidden"
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Dashboard <ChevronRight className="h-3 w-3" /> {navSections.find((s) => s.id === activeSection)?.label}
              </button>

              {actionError ? (
                <p className="rounded-xl bg-destructive/10 p-4 text-sm font-semibold text-destructive">{actionError}</p>
              ) : null}

              {activeSection === "bookings" ? (
                <SectionShell
                  title="My Bookings"
                  actions={
                    <div className="flex gap-1.5 rounded-full bg-card/15 p-1">
                      {(["upcoming", "past"] as const).map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => setBookingsTab(tab)}
                          className={cn(
                            "rounded-full px-4 py-1.5 text-xs font-bold capitalize transition-colors",
                            bookingsTab === tab ? "bg-card text-primary shadow-sm" : "text-primary-foreground/85",
                          )}
                        >
                          {tab} ({tab === "upcoming" ? upcomingOrders.length : pastOrders.length})
                        </button>
                      ))}
                    </div>
                  }
                >
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
                    <div className="py-10 text-center">
                      <p className="text-sm text-muted-foreground">
                        {bookingsTab === "upcoming" ? "No upcoming bookings yet." : "No past bookings yet."}
                      </p>
                      <Link to="/tests" className="mt-4 inline-block">
                        <ActionButton variant="primary" size="md">
                          Book Now
                        </ActionButton>
                      </Link>
                    </div>
                  )}
                </SectionShell>
              ) : null}

              {activeSection === "reports" ? (
                <SectionShell title="My Reports">
                  {orders.some((o) => o.reports.length > 0) ? (
                    <div className="-m-6">
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
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      No reports yet — they'll show up here once a sample has been collected and processed.
                    </p>
                  )}
                </SectionShell>
              ) : null}

              {activeSection === "wallet" ? (
                <SectionShell
                  title="Wallet"
                  actions={
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddMoney((v) => !v);
                        setAddMoneyError("");
                      }}
                      className="flex items-center gap-1 rounded-full bg-card/15 px-3.5 py-1.5 text-xs font-bold text-primary-foreground hover:bg-card/25"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add Money
                    </button>
                  }
                >
                  <div className="overflow-hidden rounded-[var(--radius-xl)] bg-gradient-to-br from-secondary to-primary p-6 text-secondary-foreground">
                    <p className="flex items-center gap-2 text-xs font-semibold text-secondary-foreground/80">
                      <WalletIcon className="h-4 w-4" /> Available balance
                    </p>
                    <p className="mt-1 text-3xl font-extrabold">₹{walletBalance}</p>
                    <p className="mt-2 max-w-md text-xs text-secondary-foreground/80">
                      Use your wallet balance at checkout — it's applied automatically towards your order total.
                    </p>
                  </div>

                  {showAddMoney ? (
                    <div className="surface-card mt-4 p-4">
                      <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Add money to wallet</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {[100, 250, 500, 1000].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setAddMoneyAmount(String(preset))}
                            className={cn(
                              "rounded-full border px-4 py-1.5 text-xs font-bold transition-colors",
                              addMoneyAmount === String(preset)
                                ? "border-primary bg-primary-soft text-primary"
                                : "border-border text-foreground/80 hover:border-primary/30",
                            )}
                          >
                            ₹{preset}
                          </button>
                        ))}
                      </div>
                      <div className="mt-3 flex flex-col gap-2.5 sm:flex-row">
                        <div className="flex h-11 flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3">
                          <span className="text-sm font-bold text-muted-foreground">₹</span>
                          <input
                            inputMode="numeric"
                            value={addMoneyAmount}
                            onChange={(e) => setAddMoneyAmount(e.target.value.replace(/\D/g, "").slice(0, 6))}
                            placeholder="Enter amount"
                            className="w-full bg-transparent text-sm font-semibold focus:outline-none"
                          />
                        </div>
                        <ActionButton type="button" onClick={handleAddMoney} variant="primary" size="sm" disabled={addingMoney}>
                          {addingMoney ? "Opening…" : "Proceed to pay"}
                        </ActionButton>
                      </div>
                      {addMoneyError ? <p className="mt-2 text-xs font-semibold text-destructive">{addMoneyError}</p> : null}
                    </div>
                  ) : null}

                  <div className="mt-4 flex items-center justify-between">
                    <p className="text-sm font-extrabold">Passbook</p>
                    <p className="text-[11px] text-muted-foreground">Running balance after each entry</p>
                  </div>
                  {passbookRows.length > 0 ? (
                    <div className="mt-2 -mx-6 -mb-6">
                      {passbookRows.map((t) => (
                        <div key={t.id} className="flex items-center gap-3 border-b border-dashed border-border p-4 last:border-0 transition-colors hover:bg-muted">
                          <span
                            className={cn(
                              "grid h-11 w-11 shrink-0 place-items-center rounded-xl",
                              t.type === "CREDIT" ? "bg-success-soft text-success" : "bg-destructive/10 text-destructive",
                            )}
                          >
                            <WalletIcon className="h-5 w-5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold">{t.reason}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(t.createdAt)}
                              {t.order ? ` · ${t.order.orderNumber}` : ""}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className={cn("text-sm font-extrabold", t.type === "CREDIT" ? "text-success" : "text-destructive")}>
                              {t.type === "CREDIT" ? "+" : "-"}₹{t.amount}
                            </p>
                            <p className="text-[11px] text-muted-foreground">Bal. ₹{t.balanceAfter}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-center text-sm text-muted-foreground">
                      No wallet activity yet — credits from refunds, offers or top-ups will show up here.
                    </p>
                  )}
                </SectionShell>
              ) : null}

              {activeSection === "coupons" ? (
                <SectionShell title="My Coupons">
                  <div className="surface-card p-4">
                    <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Activate a coupon</p>
                    <div className="mt-3 flex flex-col gap-2.5 sm:flex-row">
                      <input
                        value={activateCode}
                        onChange={(e) => setActivateCode(e.target.value.toUpperCase())}
                        placeholder="Enter coupon code"
                        className="h-11 flex-1 rounded-lg border border-border bg-card px-3 text-sm font-semibold uppercase focus:outline-none"
                      />
                      <ActionButton type="button" onClick={handleActivateCoupon} variant="primary" size="sm" disabled={activating}>
                        {activating ? "Activating…" : "Activate"}
                      </ActionButton>
                    </div>
                    {activateError ? <p className="mt-2 text-xs font-semibold text-destructive">{activateError}</p> : null}
                    {activatedCoupon ? (
                      <p className="mt-2 text-xs font-bold text-success">
                        {activatedCoupon.code} activated — use it at checkout for{" "}
                        {activatedCoupon.type === "PERCENT" ? `${activatedCoupon.value}% off` : `₹${activatedCoupon.value} off`}.
                      </p>
                    ) : null}
                  </div>

                  {coupons.length > 0 ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {coupons.map((c) => (
                        <div key={c.id} className="surface-card flex items-center gap-3 border-dashed p-4">
                          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                            <Gift className="h-5 w-5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-extrabold">{c.code}</p>
                            <p className="text-xs text-muted-foreground">
                              {c.type === "PERCENT" ? `${c.value}% off` : `₹${c.value} off`}
                              {c.minOrderValue ? ` · Min order ₹${c.minOrderValue}` : ""}
                              {c.maxDiscount ? ` · Up to ₹${c.maxDiscount}` : ""}
                            </p>
                            {c.endsAt ? <p className="text-[11px] text-muted-foreground">Valid till {formatDate(c.endsAt)}</p> : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopyCoupon(c.code)}
                            className="flex shrink-0 items-center gap-1 rounded-lg bg-muted px-3 py-1.5 text-xs font-bold text-foreground hover:bg-primary-soft hover:text-primary"
                          >
                            {copiedCode === c.code ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                            {copiedCode === c.code ? "Copied" : "Copy"}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="py-6 text-center text-sm text-muted-foreground">No active coupons right now — check back soon.</p>
                  )}
                </SectionShell>
              ) : null}

              {activeSection === "prescriptions" ? (
                <SectionShell
                  title="My Prescriptions"
                  actions={
                    <button
                      type="button"
                      onClick={() => setShowUploadPrescription((v) => !v)}
                      className="flex items-center gap-1 rounded-full bg-card/15 px-3.5 py-1.5 text-xs font-bold text-primary-foreground hover:bg-card/25"
                    >
                      <Plus className="h-3.5 w-3.5" /> Upload
                    </button>
                  }
                >
                  {showUploadPrescription ? (
                    <div className="mb-4 grid gap-3 rounded-xl bg-muted p-4 sm:grid-cols-2">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,application/pdf"
                        onChange={(e) => setPrescriptionFile(e.target.files?.[0] ?? null)}
                        className="h-11 rounded-lg border border-border bg-card px-3 text-sm font-medium file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-primary-foreground focus:outline-none"
                      />
                      <input
                        value={prescriptionNote}
                        onChange={(e) => setPrescriptionNote(e.target.value)}
                        placeholder="Note (optional)"
                        className="h-11 rounded-lg border border-border bg-card px-3 text-sm font-medium focus:outline-none"
                      />
                      {prescriptionError ? <p className="text-xs font-semibold text-destructive sm:col-span-2">{prescriptionError}</p> : null}
                      <ActionButton
                        type="button"
                        onClick={handleUploadPrescription}
                        variant="primary"
                        size="sm"
                        disabled={uploadingPrescription}
                        className="sm:col-span-2"
                      >
                        {uploadingPrescription ? "Uploading…" : "Upload prescription"}
                      </ActionButton>
                    </div>
                  ) : null}

                  {prescriptions.length > 0 ? (
                    <div className="-m-6 mt-0">
                      {prescriptions.map((p) => (
                        <div key={p.id} className="flex items-center gap-3 rounded-xl p-4 transition-colors hover:bg-muted">
                          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                            <FileText className="h-5 w-5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold">{p.note || "Prescription"}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(p.createdAt)} · {p.status === "REVIEWED" ? "Reviewed" : "Pending review"}
                            </p>
                          </div>
                          <a
                            href={apiFileUrl(p.fileUrl)}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="View prescription"
                            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                          >
                            <Download className="h-4.5 w-4.5" />
                          </a>
                        </div>
                      ))}
                    </div>
                  ) : !showUploadPrescription ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      No prescriptions uploaded yet — upload one so our team can review it.
                    </p>
                  ) : null}
                </SectionShell>
              ) : null}

              {activeSection === "family" ? (
                <SectionShell
                  title="Family Members"
                  actions={
                    <button
                      type="button"
                      onClick={() => setShowAddFamily((v) => !v)}
                      className="flex items-center gap-1 rounded-full bg-card/15 px-3.5 py-1.5 text-xs font-bold text-primary-foreground hover:bg-card/25"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add
                    </button>
                  }
                >
                  {familyMembers.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-3">
                      {familyMembers.map((m) => (
                        <div key={m.id} className="surface-card p-4">
                          <div className="flex items-center gap-3">
                            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                              {m.name.slice(0, 2).toUpperCase()}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold">{m.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {m.relation}
                                {m.age !== null ? ` · ${m.age} yrs` : ""}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : !showAddFamily ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">No family members added yet.</p>
                  ) : null}
                  {showAddFamily ? (
                    <div className="surface-card mt-4 grid gap-3 p-4 sm:grid-cols-2">
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
                      <input
                        value={newFamily.age}
                        onChange={(e) => setNewFamily((f) => ({ ...f, age: e.target.value.replace(/\D/g, "").slice(0, 3) }))}
                        placeholder="Age"
                        inputMode="numeric"
                        className="h-11 rounded-lg border border-border bg-muted px-3 text-sm font-medium focus:outline-none"
                      />
                      <select
                        value={newFamily.gender}
                        onChange={(e) => setNewFamily((f) => ({ ...f, gender: e.target.value }))}
                        className="h-11 rounded-lg border border-border bg-muted px-3 text-sm font-semibold focus:outline-none"
                      >
                        <option value="">Gender (optional)</option>
                        <option value="MALE">Male</option>
                        <option value="FEMALE">Female</option>
                        <option value="OTHER">Other</option>
                      </select>
                      <ActionButton type="button" onClick={handleAddFamilyMember} variant="primary" size="sm" className="sm:col-span-2">
                        Save patient
                      </ActionButton>
                    </div>
                  ) : null}
                </SectionShell>
              ) : null}

              {activeSection === "addresses" ? (
                <SectionShell
                  title="Saved Addresses"
                  actions={
                    <button
                      type="button"
                      onClick={() => {
                        resetAddressForm();
                        setShowAddAddress((v) => !v);
                      }}
                      className="flex items-center gap-1 rounded-full bg-card/15 px-3.5 py-1.5 text-xs font-bold text-primary-foreground hover:bg-card/25"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add
                    </button>
                  }
                >
                  {addresses.length > 0 ? (
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
                  ) : !showAddAddress ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">No saved addresses yet.</p>
                  ) : null}
                  {showAddAddress ? (
                    <div className="surface-card mt-4 grid gap-3 p-4 sm:grid-cols-2">
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
                </SectionShell>
              ) : null}

              {activeSection === "recommended" ? (
                <SectionShell title="Recommended For You">
                  {recommended.length > 0 ? (
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
                  ) : (
                    <p className="py-6 text-center text-sm text-muted-foreground">Nothing to recommend yet.</p>
                  )}
                </SectionShell>
              ) : null}

              {activeSection === "profile" ? (
                <SectionShell
                  title="Profile & Settings"
                  actions={
                    !editingProfile ? (
                      <button
                        type="button"
                        onClick={handleStartEditProfile}
                        className="flex items-center gap-1 rounded-full bg-card/15 px-3.5 py-1.5 text-xs font-bold text-primary-foreground hover:bg-card/25"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit profile
                      </button>
                    ) : undefined
                  }
                >
                  {profileError ? (
                    <p className="mb-3 rounded-xl bg-destructive/10 p-3 text-xs font-semibold text-destructive">{profileError}</p>
                  ) : null}

                  {!editingProfile ? (
                    <div className="grid gap-4 sm:grid-cols-2">
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
                    <div className="grid gap-3 sm:grid-cols-2">
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
                </SectionShell>
              ) : null}

              <div className="flex items-center gap-1.5 px-1 text-xs">
                <Check className="h-3.5 w-3.5 text-success" />
                <span className="text-muted-foreground">Reports verified by MD Pathologists</span>
              </div>
            </div>
          </div>
        )}
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
