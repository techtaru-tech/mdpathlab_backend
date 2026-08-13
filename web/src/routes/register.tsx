import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { Check, User } from "lucide-react";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { ApiError, authApi, session } from "@/lib/api";

const title = "Complete your profile — MD Path Lab";
const description = "Just a few details to set up your account before your first booking.";

export const Route = createFileRoute("/register")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const { redirect } = Route.useSearch();
  const isAuthed = session.getToken() !== null;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState<"" | "MALE" | "FEMALE" | "OTHER">("");
  const [dob, setDob] = useState("");
  const [city, setCity] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isAuthed && session.getUser()?.isProfileComplete) {
      window.location.href = redirect || "/dashboard";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Enter your name to continue");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const res = await authApi.completeProfile({
        name: name.trim(),
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(gender ? { gender } : {}),
        ...(dob ? { dob } : {}),
        ...(city.trim() ? { city: city.trim() } : {}),
      });
      session.save(session.getToken()!, res.user);
      window.location.href = redirect || "/dashboard";
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your details — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isAuthed) {
    return (
      <section className="relative overflow-hidden py-12 lg:py-20">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-gradient-to-b from-primary via-primary/70 to-transparent" />
        <div className="container-page relative mx-auto max-w-md">
          <div className="surface-card p-10 text-center shadow-[var(--shadow-lift)]">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-primary">
              <User className="h-7 w-7" />
            </span>
            <h1 className="mt-5 text-xl font-extrabold">Log in to continue</h1>
            <p className="mt-2 text-sm text-muted-foreground">Verify your mobile number first, then set up your profile.</p>
            <Link to="/login" search={{ redirect: "/register" }} className="mt-6 block">
              <ActionButton variant="primary" size="lg" className="w-full">
                Log in
              </ActionButton>
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="relative overflow-hidden py-12 lg:py-20">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-gradient-to-b from-primary via-primary/70 to-transparent" />

      <div className="container-page relative mx-auto max-w-md">
        <div className="surface-card p-8 shadow-[var(--shadow-lift)]">
          <Link to="/" className="mx-auto flex w-fit items-center gap-2.5">
            <img src="/logo.png" alt="MD Path Lab" className="h-11 w-11 rounded-full object-contain" />
            <span className="text-xl font-extrabold tracking-tight text-primary">
              MD <span className="text-secondary">Path Lab</span>
            </span>
          </Link>

          <h1 className="mt-7 text-center text-2xl font-extrabold">Welcome! Let's set up your profile</h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Just your name is required — the rest helps us personalise your reports.
          </p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <label className="block">
              <span className="mb-2 block text-xs font-bold tracking-wide text-muted-foreground uppercase">Full name *</span>
              <input
                autoFocus
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                className="h-12 w-full rounded-xl border border-border bg-muted px-4 text-sm font-semibold focus:border-primary focus:outline-none"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-bold tracking-wide text-muted-foreground uppercase">Email (optional)</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-12 w-full rounded-xl border border-border bg-muted px-4 text-sm font-semibold focus:border-primary focus:outline-none"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-2 block text-xs font-bold tracking-wide text-muted-foreground uppercase">Gender</span>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as typeof gender)}
                  className="h-12 w-full rounded-xl border border-border bg-muted px-3 text-sm font-semibold focus:border-primary focus:outline-none"
                >
                  <option value="">Prefer not to say</option>
                  <option value="FEMALE">Female</option>
                  <option value="MALE">Male</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-bold tracking-wide text-muted-foreground uppercase">Date of birth</span>
                <input
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  className="h-12 w-full rounded-xl border border-border bg-muted px-3 text-sm font-semibold focus:border-primary focus:outline-none"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-2 block text-xs font-bold tracking-wide text-muted-foreground uppercase">City (optional)</span>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Kanpur"
                className="h-12 w-full rounded-xl border border-border bg-muted px-4 text-sm font-semibold focus:border-primary focus:outline-none"
              />
            </label>

            {error ? <p className="text-xs font-semibold text-destructive">{error}</p> : null}

            <ActionButton variant="primary" size="lg" className="mt-2 w-full" type="submit" disabled={submitting}>
              {submitting ? (
                "Saving…"
              ) : (
                <>
                  <Check className="h-4 w-4" /> Continue
                </>
              )}
            </ActionButton>
          </form>
        </div>
      </div>
    </section>
  );
}
