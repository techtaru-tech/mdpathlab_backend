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
  Phone,
  Plus,
  Receipt,
  Settings,
  Sparkles,
  User,
  Users,
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
  type Order,
  type Profile,
} from "@/lib/api";
import { catalogueApi } from "@/lib/catalogue";
import type { Pkg } from "@/data/site";
import { slugify } from "@/data/site";
import { cn } from "@/lib/utils";

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

const statusLabels: Record<Order["status"], { label: string; tint: string }> = {
  PENDING_PAYMENT: { label: "Awaiting payment", tint: "bg-warning/15 text-warning" },
  CONFIRMED: { label: "Confirmed", tint: "bg-success-soft text-success" },
  PHLEBOTOMIST_ASSIGNED: { label: "Phlebotomist assigned", tint: "bg-primary-soft text-primary" },
  SAMPLE_COLLECTED: { label: "Sample collected", tint: "bg-secondary-soft text-secondary" },
  IN_LAB: { label: "In lab", tint: "bg-secondary-soft text-secondary" },
  REPORT_READY: { label: "Report ready", tint: "bg-success-soft text-success" },
  CANCELLED: { label: "Cancelled", tint: "bg-destructive/10 text-destructive" },
};

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

  const [showAddFamily, setShowAddFamily] = useState(false);
  const [newFamily, setNewFamily] = useState({ name: "", relation: "Self", gender: "", dob: "" });
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [newAddress, setNewAddress] = useState({ label: "Home", line1: "", city: "", pincode: "", phone: "" });

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

  async function handleAddAddress() {
    if (!newAddress.line1.trim() || !newAddress.city.trim() || !/^\d{6}$/.test(newAddress.pincode)) {
      setActionError("Enter address line, city and a valid 6-digit pincode to continue");
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
      setNewAddress({ label: "Home", line1: "", city: "", pincode: "", phone: "" });
      setShowAddAddress(false);
      setActionError("");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Couldn't add address");
    }
  }

  async function handleCancelOrder(id: string) {
    setCancellingId(id);
    setActionError("");
    try {
      const updated = await ordersApi.cancel(id);
      setOrders((prev) => prev.map((o) => (o.id === id ? updated : o)));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Couldn't cancel this booking");
    } finally {
      setCancellingId(null);
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
            <h2 className="text-lg font-extrabold">My Bookings</h2>
            {upcomingOrders.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {upcomingOrders.map((o) => (
                  <div key={o.id} className="surface-card overflow-hidden p-0">
                    <div className="flex items-center justify-between gap-3 border-b border-dashed border-border p-5 pb-4">
                      <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold uppercase", statusLabels[o.status].tint)}>
                        {statusLabels[o.status].label}
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
                      <button
                        type="button"
                        onClick={() => handleCancelOrder(o.id)}
                        disabled={cancellingId === o.id}
                        className="block w-full pt-1"
                      >
                        <ActionButton variant="outline" size="sm" className="w-full" disabled={cancellingId === o.id}>
                          {cancellingId === o.id ? "Cancelling…" : "Cancel booking"}
                        </ActionButton>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="surface-card p-6 text-sm text-muted-foreground">No upcoming bookings yet.</p>
            )}

            {orders.length > 0 ? (
              <div className="surface-card overflow-hidden p-0">
                <div className="flex items-center justify-between border-b border-border p-5">
                  <h3 className="flex items-center gap-2 text-sm font-extrabold">
                    <Receipt className="h-4 w-4 text-primary" /> Booking history
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border text-[11px] font-semibold text-muted-foreground uppercase">
                        <th className="px-5 py-3">Package / Test</th>
                        <th className="px-5 py-3">Date</th>
                        <th className="px-5 py-3">Amount</th>
                        <th className="px-5 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((o) => (
                        <tr key={o.id} className="border-b border-border last:border-0">
                          <td className="max-w-[220px] truncate px-5 py-3.5 font-semibold">
                            {o.items.map((i) => i.itemName).join(", ")}
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap text-muted-foreground">
                            {new Date(o.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                          </td>
                          <td className="px-5 py-3.5 font-bold">₹{o.total}</td>
                          <td className="px-5 py-3.5">
                            <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", statusLabels[o.status].tint)}>
                              {statusLabels[o.status].label}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
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
                onClick={() => setShowAddAddress((v) => !v)}
                className="flex items-center gap-1 text-xs font-bold text-primary hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {addresses.map((a) => (
                <div key={a.id} className="surface-card p-4">
                  <span className="flex items-center gap-2 text-sm font-extrabold">
                    <HomeIcon className="h-4 w-4 text-primary" /> {a.label ?? "Address"}
                    {a.isDefault ? (
                      <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-bold text-primary">
                        Default
                      </span>
                    ) : null}
                  </span>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {a.line1}, {a.city} {a.pincode}
                  </p>
                </div>
              ))}
            </div>
            {addresses.length === 0 ? (
              <p className="text-sm text-muted-foreground">No saved addresses yet.</p>
            ) : null}
            {showAddAddress ? (
              <div className="surface-card grid gap-3 p-4 sm:grid-cols-2">
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
                <ActionButton type="button" onClick={handleAddAddress} variant="primary" size="sm" className="sm:col-span-2">
                  Save address
                </ActionButton>
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
            <h2 className="text-lg font-extrabold">Profile & Settings</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {[
                { label: "Full name", value: profile?.name },
                { label: "Mobile number", value: profile?.phone ? `+91 ${profile.phone}` : null },
                { label: "Email address", value: profile?.email },
                { label: "Date of birth", value: profile?.dob ? formatDate(profile.dob) : null },
                { label: "Gender", value: profile?.gender },
                { label: "City", value: profile?.city },
              ].map((f) => (
                <div key={f.label} className="border-b border-dashed border-border pb-3">
                  <p className="text-[11px] font-semibold text-muted-foreground">{f.label}</p>
                  <p className="mt-1 text-sm font-bold">{f.value ?? "Not set"}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-1 text-xs">
            <Check className="h-3.5 w-3.5 text-success" />
            <span className="text-muted-foreground">Reports verified by MD Pathologists</span>
          </div>
        </div>
      </div>
    </section>
  );
}
