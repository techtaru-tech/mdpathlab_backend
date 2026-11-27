import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, Mail, UserRound } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { AdminApiError, adminAuthApi, adminSession, type AdminOwnProfile } from "@/lib/admin-api";

export const Route = createFileRoute("/admin/profile")({
  head: () => ({ meta: [{ title: "My profile — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminProfilePage,
});

const inputClass = "h-11 w-full rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none";
const errorText = (err: unknown, fallback: string) => (err instanceof AdminApiError ? err.message : fallback);
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "never");
type Msg = { ok: boolean; text: string } | null;

function AdminProfilePage() {
  const [profile, setProfile] = useState<AdminOwnProfile | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    adminAuthApi
      .profile()
      .then(setProfile)
      .catch((err) => setError(errorText(err, "Couldn't load your profile")));
  }, []);

  // Keeps the sidebar's name / email in step, and stores a renewed token (email or password changed).
  const changed = (p: AdminOwnProfile, accessToken?: string) => {
    setProfile(p);
    adminSession.save(accessToken ?? adminSession.getToken() ?? "", { id: p.id, email: p.email, name: p.name });
  };

  return (
    <AdminLayout activePath="/admin/profile">
      <AdminPageHeader title="My profile" description="Your details, sign-in email and password." />
      {error ? <p className="mt-4 text-sm font-semibold text-destructive">{error}</p> : null}
      {!profile && !error ? <div className="mt-6 h-64 animate-pulse rounded-2xl bg-muted" /> : null}
      {profile ? (
        <div className="mt-6 grid max-w-4xl gap-6 lg:grid-cols-2">
          <DetailsCard profile={profile} onSaved={changed} />
          <EmailCard profile={profile} onChanged={changed} />
          <PasswordCard profile={profile} onChanged={changed} />
        </div>
      ) : null}
    </AdminLayout>
  );
}

function Card({ icon: Icon, title, hint, children }: { icon: typeof Mail; title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-extrabold">{title}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
      <div className="mt-5 space-y-3">{children}</div>
    </div>
  );
}

function Message({ m }: { m: Msg }) {
  return m ? <p className={m.ok ? "text-sm font-semibold text-success" : "text-sm font-semibold text-destructive"}>{m.text}</p> : null;
}

function DetailsCard({ profile, onSaved }: { profile: AdminOwnProfile; onSaved: (p: AdminOwnProfile) => void }) {
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const dirty = name.trim() !== profile.name || phone !== (profile.phone ?? "");

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      onSaved(await adminAuthApi.updateProfile({ name: name.trim(), phone: phone || null }));
      setMsg({ ok: true, text: "Saved." });
    } catch (err) {
      setMsg({ ok: false, text: errorText(err, "Couldn't save") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card icon={UserRound} title="Your details" hint={`Admin since ${fmt(profile.createdAt).split(",")[0]}`}>
      <label className="block text-xs font-bold text-muted-foreground">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputClass} mt-1`} />
      </label>
      <label className="block text-xs font-bold text-muted-foreground">
        Mobile number (optional)
        <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" placeholder="10-digit mobile" className={`${inputClass} mt-1`} />
      </label>
      <ActionButton size="sm" variant="navy" onClick={save} disabled={busy || !dirty || name.trim().length < 2}>
        {busy ? "Saving…" : "Save details"}
      </ActionButton>
      <Message m={msg} />
    </Card>
  );
}

function EmailCard({ profile, onChanged }: { profile: AdminOwnProfile; onChanged: (p: AdminOwnProfile, token: string) => void }) {
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function sendCode() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await adminAuthApi.emailCode(newEmail.trim(), password);
      setSent(`We sent a 6-digit code to ${r.sentTo}.${r.devCode ? ` (test code ${r.devCode})` : ""}`);
    } catch (err) {
      setMsg({ ok: false, text: errorText(err, "Couldn't send the code") });
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await adminAuthApi.confirmEmail(code);
      onChanged(r.profile, r.accessToken);
      setSent(null);
      setNewEmail("");
      setPassword("");
      setCode("");
      setMsg({ ok: true, text: `Your email is now ${r.profile.email}. Use it to sign in.` });
    } catch (err) {
      setMsg({ ok: false, text: errorText(err, "Couldn't change the email") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card icon={Mail} title="Sign-in email" hint={`Now: ${profile.email}`}>
      {!sent ? (
        <>
          <label className="block text-xs font-bold text-muted-foreground">
            New email
            <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="name@example.com" className={`${inputClass} mt-1`} />
          </label>
          <label className="block text-xs font-bold text-muted-foreground">
            Current password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className={`${inputClass} mt-1`} />
          </label>
          <ActionButton size="sm" variant="navy" onClick={sendCode} disabled={busy || !newEmail.includes("@") || !password}>
            {busy ? "Sending…" : "Send code to new email"}
          </ActionButton>
          <p className="text-xs text-muted-foreground">A code goes to the new address to prove it is yours. Your old address is told about the change.</p>
        </>
      ) : (
        <>
          <p className="text-xs font-semibold text-success">{sent}</p>
          <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="6-digit code" className={`${inputClass} w-48`} />
          <div className="flex flex-wrap items-center gap-3">
            <ActionButton size="sm" variant="navy" onClick={confirm} disabled={busy || code.length !== 6}>
              {busy ? "Checking…" : "Confirm new email"}
            </ActionButton>
            <button type="button" onClick={() => setSent(null)} className="text-xs font-bold text-muted-foreground hover:underline">
              Back
            </button>
          </div>
        </>
      )}
      <Message m={msg} />
    </Card>
  );
}

function PasswordCard({ profile, onChanged }: { profile: AdminOwnProfile; onChanged: (p: AdminOwnProfile, token: string) => void }) {
  const [current, setCurrent] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const strong = next.length >= 8 && /[A-Za-z]/.test(next) && /\d/.test(next);

  async function sendCode() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await adminAuthApi.passwordCode(current);
      setSent(`We sent a 6-digit code to ${r.sentTo}.${r.devCode ? ` (test code ${r.devCode})` : ""}`);
    } catch (err) {
      setMsg({ ok: false, text: errorText(err, "Couldn't send the code") });
    } finally {
      setBusy(false);
    }
  }

  async function change() {
    if (next !== again) return setMsg({ ok: false, text: "The two new passwords don't match" });
    setBusy(true);
    setMsg(null);
    try {
      const r = await adminAuthApi.changePassword(code, next);
      onChanged(r.profile, r.accessToken);
      setSent(null);
      setCurrent("");
      setCode("");
      setNext("");
      setAgain("");
      setMsg({ ok: true, text: "Password changed. Every other browser where you were signed in has been signed out." });
    } catch (err) {
      setMsg({ ok: false, text: errorText(err, "Couldn't change the password") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card icon={KeyRound} title="Password" hint={`Last changed: ${fmt(profile.passwordChangedAt)}`}>
      {!sent ? (
        <>
          <label className="block text-xs font-bold text-muted-foreground">
            Current password
            <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" className={`${inputClass} mt-1`} />
          </label>
          <ActionButton size="sm" variant="navy" onClick={sendCode} disabled={busy || !current}>
            {busy ? "Sending…" : "Send code to my email"}
          </ActionButton>
          <p className="text-xs text-muted-foreground">A code goes to {profile.email}. Changing the password signs you out everywhere else.</p>
        </>
      ) : (
        <>
          <p className="text-xs font-semibold text-success">{sent}</p>
          <label className="block text-xs font-bold text-muted-foreground">
            Code from the email
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="6-digit code" className={`${inputClass} mt-1 w-48`} />
          </label>
          <label className="block text-xs font-bold text-muted-foreground">
            New password
            <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" className={`${inputClass} mt-1`} />
          </label>
          <label className="block text-xs font-bold text-muted-foreground">
            New password again
            <input type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" className={`${inputClass} mt-1`} />
          </label>
          <p className={next && !strong ? "text-xs font-semibold text-warning" : "text-xs text-muted-foreground"}>At least 8 characters, with a letter and a number.</p>
          <div className="flex flex-wrap items-center gap-3">
            <ActionButton size="sm" variant="navy" onClick={change} disabled={busy || code.length !== 6 || !strong || !again}>
              {busy ? "Changing…" : "Change password"}
            </ActionButton>
            <button type="button" onClick={() => setSent(null)} className="text-xs font-bold text-muted-foreground hover:underline">
              Back
            </button>
          </div>
        </>
      )}
      <Message m={msg} />
    </Card>
  );
}
