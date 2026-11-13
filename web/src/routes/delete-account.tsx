import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Trash2 } from "lucide-react";
import { ApiError, authApi, session, type AuthUser } from "@/lib/api";
import { PageHero } from "@/components/ui-kit/PageHero";

const title = "Delete your account — MD Path Lab";
const LOGIN_HREF = `/login?redirect=${encodeURIComponent("/delete-account")}`;

export const Route = createFileRoute("/delete-account")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: "Delete your MD Path Lab account and the personal details stored with it." },
    ],
  }),
  component: DeleteAccountPage,
});

type Check = Awaited<ReturnType<typeof authApi.deletionCheck>>;

const removed = [
  "Your name, email address, date of birth, gender and city",
  "Your mobile number (it can be used to sign up again as a new account)",
  "Family members, saved addresses and your cart",
  "Notifications, app login and push notifications on every device",
  "Prescriptions you uploaded that were not used for a booking",
  "Your wallet balance (it can't be refunded or used after the account is deleted)",
];

const kept = [
  "Past bookings, payments and lab reports, kept without your name or contact details, because the lab and our accounts are required to keep these records",
];

/**
 * Account deletion — the page the Play Store listing links to, and where the app's "Delete account" can send people.
 * Open to everyone: it explains what is deleted and asks a logged-out visitor to log in with their mobile number
 * (OTP) first, so only the owner of the number can delete it.
 */
function DeleteAccountPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [check, setCheck] = useState<Check | null>(null);
  const [checkError, setCheckError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // The session lives in localStorage, so it is read after mount (the server render has no session).
  useEffect(() => {
    const u = session.getToken() ? session.getUser() : null;
    setUser(u);
    setReady(true);
    if (u) {
      authApi
        .deletionCheck()
        .then(setCheck)
        .catch((err) => {
          if (err instanceof ApiError && err.status === 401) setUser(null);
          else setCheckError("Couldn't check your account — please refresh the page");
        });
    }
  }, []);

  async function remove() {
    setDeleting(true);
    setError("");
    try {
      await authApi.deleteAccount();
      session.clear();
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't delete your account — please try again");
      setDeleting(false);
    }
  }

  return (
    <>
      <PageHero
        crumb="Delete account"
        eyebrow="Your account"
        title="Delete your account"
        description="Remove your MD Path Lab account and the personal details stored with it."
      />
      <section className="py-12 lg:py-16">
        <div className="container-page mx-auto max-w-3xl space-y-6">
          {done ? (
            <div className="rounded-2xl border border-success/30 bg-success-soft p-6">
              <p className="flex items-center gap-2 text-base font-extrabold text-success">
                <CheckCircle2 className="h-5 w-5" /> Your account has been deleted
              </p>
              <p className="mt-2 text-sm text-foreground/80">
                Your personal details have been removed and you have been logged out. You can sign up again with the same mobile number at any time.
              </p>
              <Link to="/" className="mt-4 inline-block text-sm font-bold text-primary hover:underline">
                Back to the home page
              </Link>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <h2 className="text-base font-extrabold">What happens when you delete your account</h2>
                <p className="mt-3 text-sm font-bold">Deleted straight away:</p>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-foreground/85">
                  {removed.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                <p className="mt-4 text-sm font-bold">Kept:</p>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-foreground/85">
                  {kept.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                <p className="mt-4 text-sm text-muted-foreground">
                  Deleting can't be undone. Download any reports you want to keep from <a href="/dashboard?section=reports" className="font-semibold text-primary hover:underline">My Reports</a> first.
                  An account with a booking or home visit still in progress can be deleted once that is finished or cancelled.
                  You can also ask us to delete it from the <Link to="/contact" className="font-semibold text-primary hover:underline">Contact</Link> page.
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                {!ready ? (
                  <div className="h-16 animate-pulse rounded-xl bg-muted" />
                ) : !user ? (
                  <>
                    <p className="text-sm">Log in with the mobile number of the account you want to delete. We'll send you an OTP to confirm it's you.</p>
                    <a href={LOGIN_HREF} className="mt-4 inline-flex rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">
                      Log in to continue
                    </a>
                  </>
                ) : checkError ? (
                  <p className="text-sm font-semibold text-destructive">{checkError}</p>
                ) : !check ? (
                  <div className="h-16 animate-pulse rounded-xl bg-muted" />
                ) : !check.canDelete ? (
                  <>
                    <p className="text-sm">
                      Logged in as <span className="font-bold">+91 {user.phone}</span>
                    </p>
                    <p className="mt-3 flex items-start gap-2 rounded-lg bg-warning/10 p-3 text-sm font-semibold text-warning">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {check.reason}
                    </p>
                  </>
                ) : !confirming ? (
                  <>
                    <p className="text-sm">
                      Logged in as <span className="font-bold">+91 {user.phone}</span>
                      {user.name ? ` (${user.name})` : ""}
                    </p>
                    {check.walletBalance > 0 ? (
                      <p className="mt-3 rounded-lg bg-warning/10 p-3 text-sm font-semibold text-warning">
                        Your wallet has ₹{check.walletBalance}. It will be lost when the account is deleted.
                      </p>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setConfirming(true)}
                      className="mt-4 inline-flex items-center gap-2 rounded-lg bg-destructive px-5 py-2.5 text-sm font-bold text-white"
                    >
                      <Trash2 className="h-4 w-4" /> Delete my account
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-bold">Type DELETE to confirm. This can't be undone.</p>
                    <input
                      value={typed}
                      onChange={(e) => setTyped(e.target.value)}
                      placeholder="DELETE"
                      autoFocus
                      className="mt-3 w-full max-w-xs rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none"
                    />
                    {error ? <p className="mt-3 text-sm font-semibold text-destructive">{error}</p> : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirming(false);
                          setTyped("");
                        }}
                        className="rounded-lg border border-border px-4 py-2 text-sm font-bold"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={typed.trim().toUpperCase() !== "DELETE" || deleting}
                        onClick={remove}
                        className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" /> {deleting ? "Deleting…" : "Permanently delete"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}
