import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarClock, Check, Home, MapPin, User } from "lucide-react";
import { PageHero } from "@/components/ui-kit/PageHero";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { ApiError, homeVisitsApi, patientsApi, session, type Address, type HomeVisitWindow, type MyHomeVisit } from "@/lib/api";
import { useAuthed } from "@/lib/useAuthed";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/home-visit")({
  head: () => ({
    meta: [
      { title: "Book a Home Visit — MD Path Lab" },
      { name: "description", content: "Not sure which tests you need? Book a phlebotomist home visit and decide the tests at your door." },
    ],
  }),
  component: HomeVisitPage,
});

const WINDOWS: { id: HomeVisitWindow; label: string }[] = [
  { id: "MORNING", label: "7 AM – 11 AM" },
  { id: "AFTERNOON", label: "11 AM – 3 PM" },
  { id: "EVENING", label: "3 PM – 7 PM" },
];

const STATUS_TEXT: Record<MyHomeVisit["status"], string> = {
  REQUESTED: "Requested — we will assign a phlebotomist",
  ASSIGNED: "Phlebotomist assigned",
  ON_THE_WAY: "Phlebotomist on the way",
  ARRIVED: "Phlebotomist has arrived",
  TESTS_ADDED: "Tests added — booking created",
  COLLECTED: "Sample collected",
  COMPLETED: "Report ready",
  CANCELLED: "Cancelled",
  NO_SHOW: "Visit missed",
};

// Today + the next 6 days in IST (the API accepts at most 6 days ahead).
function nextDates(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.now() + 5.5 * 3600000 + i * 86400000);
    const value = d.toISOString().slice(0, 10);
    const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : new Date(value + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
    out.push({ value, label });
  }
  return out;
}

const input = "h-11 w-full rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none";

function HomeVisitPage() {
  const authed = useAuthed();
  const dates = nextDates();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [visits, setVisits] = useState<MyHomeVisit[]>([]);
  const [form, setForm] = useState({
    patientName: "",
    phone: "",
    age: "",
    gender: "",
    concern: "",
    addressId: "",
    address: "",
    city: "",
    pincode: "",
    preferredDate: dates[1]!.value,
    preferredWindow: "MORNING" as HomeVisitWindow,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  function loadVisits() {
    homeVisitsApi.listMine().then(setVisits).catch(() => undefined);
  }

  useEffect(() => {
    if (!authed) return;
    const u = session.getUser();
    setForm((f) => ({ ...f, patientName: f.patientName || u?.name || "", phone: f.phone || u?.phone || "" }));
    patientsApi
      .listAddresses()
      .then((list) => {
        setAddresses(list);
        const preferred = list.find((a) => a.isDefault) ?? list[0];
        if (preferred) pickAddress(preferred);
      })
      .catch(() => undefined);
    loadVisits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  function pickAddress(a: Address) {
    setForm((f) => ({
      ...f,
      addressId: a.id,
      address: [a.houseNo, a.line1, a.landmark].filter(Boolean).join(", "),
      city: a.city,
      pincode: a.pincode,
    }));
  }

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value, ...(key === "address" || key === "city" || key === "pincode" ? { addressId: "" } : {}) }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.patientName.trim()) return setError("Enter the patient's name");
    if (!/^[6-9]\d{9}$/.test(form.phone)) return setError("Enter a valid 10-digit mobile number");
    if (!form.address.trim() || !form.city.trim()) return setError("Enter the full address and city");
    if (!/^\d{6}$/.test(form.pincode)) return setError("Enter a 6-digit pincode");
    setSubmitting(true);
    try {
      await homeVisitsApi.create({
        patientName: form.patientName.trim(),
        phone: form.phone,
        ...(form.age ? { age: Number(form.age) } : {}),
        ...(form.gender ? { gender: form.gender } : {}),
        ...(form.concern.trim() ? { concern: form.concern.trim() } : {}),
        ...(form.addressId ? { addressId: form.addressId } : {}),
        address: form.address.trim(),
        city: form.city.trim(),
        pincode: form.pincode,
        preferredDate: form.preferredDate,
        preferredWindow: form.preferredWindow,
      });
      setDone(true);
      loadVisits();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't book the visit — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel(v: MyHomeVisit) {
    if (!window.confirm("Cancel this home visit?")) return;
    try {
      await homeVisitsApi.cancel(v.id);
      loadVisits();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't cancel this visit");
    }
  }

  return (
    <>
      <PageHero
        crumb="Home visit"
        eyebrow="Not sure which tests you need?"
        title="Book a phlebotomist home visit"
        description="Tell us when to come. Our phlebotomist visits, helps you decide the tests at your door, and collects the samples — you pay after collection."
      />

      <section className="py-10 lg:py-14">
        <div className="container-page mx-auto max-w-3xl">
          {authed === false ? (
            <div className="surface-card p-8 text-center">
              <User className="mx-auto h-8 w-8 text-primary" />
              <h2 className="mt-3 text-lg font-extrabold">Log in to book a home visit</h2>
              <Link to="/login" search={{ redirect: "/home-visit" }} className="mt-5 inline-block">
                <ActionButton variant="primary" size="md">
                  Log in
                </ActionButton>
              </Link>
            </div>
          ) : done ? (
            <div className="surface-card border border-success/20 bg-success-soft p-6">
              <div className="flex items-center gap-3">
                <Check className="h-6 w-6 text-success" />
                <h2 className="text-lg font-extrabold text-success">Home visit requested</h2>
              </div>
              <p className="mt-2 text-sm text-success/80">
                We'll assign a phlebotomist and notify you. When they arrive they'll add the tests to a booking you can see in My Bookings.
              </p>
              <button type="button" onClick={() => setDone(false)} className="mt-4 text-sm font-bold text-primary hover:underline">
                Book another visit
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="surface-card space-y-6 p-6">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-extrabold uppercase text-muted-foreground">
                  <User className="h-4 w-4" /> Patient
                </h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <input className={input} placeholder="Patient name" value={form.patientName} onChange={set("patientName")} />
                  <input className={input} placeholder="Mobile number" inputMode="numeric" maxLength={10} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }))} />
                  <input className={input} placeholder="Age (optional)" inputMode="numeric" value={form.age} onChange={(e) => setForm((f) => ({ ...f, age: e.target.value.replace(/\D/g, "").slice(0, 3) }))} />
                  <select className={input} value={form.gender} onChange={set("gender")}>
                    <option value="">Gender (optional)</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <textarea
                  className="mt-3 w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm focus:outline-none"
                  rows={2}
                  placeholder="What would you like to check? e.g. fever for 3 days, routine check-up (optional)"
                  value={form.concern}
                  onChange={set("concern")}
                />
              </div>

              <div>
                <h2 className="flex items-center gap-2 text-sm font-extrabold uppercase text-muted-foreground">
                  <MapPin className="h-4 w-4" /> Address
                </h2>
                {addresses.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {addresses.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => pickAddress(a)}
                        className={cn("rounded-full border px-3 py-1.5 text-xs font-bold", form.addressId === a.id ? "border-primary bg-primary-soft text-primary" : "border-border")}
                      >
                        {a.label || a.city} · {a.pincode}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="mt-3 grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
                  <input className={input} placeholder="House / street / landmark" value={form.address} onChange={set("address")} />
                  <input className={input} placeholder="City" value={form.city} onChange={set("city")} />
                  <input className={input} placeholder="Pincode" inputMode="numeric" maxLength={6} value={form.pincode} onChange={(e) => setForm((f) => ({ ...f, addressId: "", pincode: e.target.value.replace(/\D/g, "").slice(0, 6) }))} />
                </div>
              </div>

              <div>
                <h2 className="flex items-center gap-2 text-sm font-extrabold uppercase text-muted-foreground">
                  <CalendarClock className="h-4 w-4" /> When
                </h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {dates.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, preferredDate: d.value }))}
                      className={cn("rounded-lg border px-3 py-2 text-xs font-bold", form.preferredDate === d.value ? "border-primary bg-primary-soft text-primary" : "border-border")}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {WINDOWS.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, preferredWindow: w.id }))}
                      className={cn("rounded-lg border px-3 py-2.5 text-sm font-bold", form.preferredWindow === w.id ? "border-primary bg-primary-soft text-primary" : "border-border")}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
              </div>

              {error ? <p className="rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive">{error}</p> : null}
              <ActionButton type="submit" variant="primary" size="lg" className="w-full" disabled={submitting || authed !== true}>
                {submitting ? "Booking…" : "Book home visit"}
              </ActionButton>
              <p className="text-center text-xs text-muted-foreground">No payment now — you pay for the tests after collection.</p>
            </form>
          )}

          {authed && visits.length > 0 ? (
            <div className="mt-10">
              <h2 className="flex items-center gap-2 text-lg font-extrabold">
                <Home className="h-5 w-5 text-primary" /> My home visits
              </h2>
              <div className="mt-4 space-y-3">
                {visits.map((v) => (
                  <div key={v.id} className="surface-card flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-bold">
                        {v.preferredDate} · {v.windowLabel}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {v.patientName} · {v.city} {v.pincode}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-primary">{STATUS_TEXT[v.status]}</p>
                      {v.phlebotomist ? (
                        <p className="text-xs text-muted-foreground">
                          Phlebotomist: {v.phlebotomist.name ?? "—"} · {v.phlebotomist.phone}
                        </p>
                      ) : null}
                      {v.cancelReason && v.status === "CANCELLED" ? <p className="text-xs text-muted-foreground">{v.cancelReason}</p> : null}
                    </div>
                    <div className="flex gap-2">
                      {v.orderId ? (
                        <Link to="/booking/$orderId" params={{ orderId: v.orderId }}>
                          <ActionButton variant="outline" size="sm">
                            View booking
                          </ActionButton>
                        </Link>
                      ) : null}
                      {v.status === "REQUESTED" || v.status === "ASSIGNED" ? (
                        <ActionButton variant="outline" size="sm" onClick={() => cancel(v)}>
                          Cancel
                        </ActionButton>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}
