import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Check, Stethoscope } from "lucide-react";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { useAuthed } from "@/lib/useAuthed";
import { ReferralApiError, partnerTitle, pendingReferral, referralApi, type ClaimStatus, type ReferralLookup } from "@/lib/referral-api";

// A doctor's / clinic's referral link. Not logged in: remember the code and send the person through the normal
// login (its existing `redirect` brings them back here). Logged in: ask them to confirm the link.
export const Route = createFileRoute("/r/$code")({
  validateSearch: z.object({ src: z.string().optional() }),
  head: () => ({ meta: [{ title: "Referral — MD Path Lab" }, { name: "robots", content: "noindex" }] }),
  component: ReferralLandingPage,
});

const MESSAGES: Record<ClaimStatus, { title: string; body: string }> = {
  BOUND: { title: "You're all set", body: "is now your referring doctor on MD Path Labs." },
  ALREADY_REFERRED: { title: "Already linked", body: "Your account is already linked to a referring doctor, so nothing was changed." },
  NOT_ELIGIBLE: { title: "Not applied", body: "This referral link can't be applied to your account. You can still book tests as usual." },
  INVALID: { title: "Link not active", body: "This referral link is not active. You can still book tests as usual." },
};

function ReferralLandingPage() {
  const { code } = Route.useParams();
  const { src } = Route.useSearch();
  const navigate = useNavigate();
  const isAuthed = useAuthed();
  const [info, setInfo] = useState<ReferralLookup | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [result, setResult] = useState<ClaimStatus | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    referralApi
      .lookup(code)
      .then((res) => {
        setInfo(res);
        if (res.valid) {
          const existing = pendingReferral.get();
          pendingReferral.save({
            code: code.toUpperCase(),
            source: src === "qr" ? "QR" : "LINK",
            capturedAt: existing?.code === code.toUpperCase() ? existing.capturedAt : new Date().toISOString(),
          });
        }
      })
      .catch(() => setInfo({ valid: false }));
  }, [code, src]);

  async function confirm() {
    setClaiming(true);
    setError("");
    try {
      const pending = pendingReferral.get();
      const res = await referralApi.claim(code, pending?.source ?? (src === "qr" ? "QR" : "LINK"), pending?.capturedAt);
      setResult(res.status);
      pendingReferral.clear();
    } catch (err) {
      setError(err instanceof ReferralApiError && err.status !== 404 ? err.message : "Couldn't apply the referral — please try again");
    } finally {
      setClaiming(false);
    }
  }

  const partner = info?.valid ? info.partner : null;

  return (
    <section className="relative overflow-hidden py-12 lg:py-20">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-gradient-to-b from-primary via-primary/70 to-transparent" />
      <div className="container-page relative mx-auto max-w-md">
        <div className="surface-card p-8 text-center shadow-[var(--shadow-lift)]">
          <div className="mx-auto flex w-fit items-center gap-2.5">
            <img src="/logo.png" alt="MD Path Lab" className="h-11 w-11 rounded-full object-contain" />
            <span className="text-xl font-extrabold tracking-tight text-primary">
              MD <span className="text-secondary">Path Lab</span>
            </span>
          </div>

          {info === null ? <p className="mt-8 text-sm text-muted-foreground">Checking your link…</p> : null}

          {info && !partner && !result ? (
            <>
              <h1 className="mt-7 text-xl font-extrabold">{MESSAGES.INVALID.title}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{MESSAGES.INVALID.body}</p>
              <Link to="/tests" className="mt-6 inline-block text-sm font-bold text-primary hover:underline">
                Browse tests
              </Link>
            </>
          ) : null}

          {partner && !result ? (
            <>
              <span className="mx-auto mt-7 grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-primary">
                <Stethoscope className="h-7 w-7" />
              </span>
              <p className="mt-4 text-[11px] font-bold tracking-wide text-muted-foreground uppercase">You've been referred by</p>
              <h1 className="mt-1 text-2xl font-extrabold">{partnerTitle(partner)}</h1>
              {partner.city ? <p className="text-sm text-muted-foreground">{partner.city}</p> : null}

              {isAuthed === false ? (
                <>
                  <p className="mt-5 text-sm text-muted-foreground">Sign in or create your account to continue. We'll link your referral once you're in.</p>
                  <ActionButton
                    variant="primary"
                    size="lg"
                    className="mt-6 w-full"
                    onClick={() => navigate({ to: "/login", search: { redirect: `/r/${code}` } })}
                  >
                    Continue
                  </ActionButton>
                </>
              ) : null}

              {isAuthed === true ? (
                <>
                  <p className="mt-5 text-sm text-muted-foreground">Link {partnerTitle(partner)} as your referring doctor on MD Path Labs?</p>
                  <ActionButton variant="primary" size="lg" className="mt-6 w-full" onClick={confirm} disabled={claiming}>
                    {claiming ? "Linking…" : "Yes, link my account"}
                  </ActionButton>
                  <Link to="/tests" onClick={() => pendingReferral.clear()} className="mt-4 inline-block text-xs font-bold text-muted-foreground hover:underline">
                    Not now
                  </Link>
                  {error ? <p className="mt-3 text-xs font-semibold text-destructive">{error}</p> : null}
                </>
              ) : null}
            </>
          ) : null}

          {result ? (
            <>
              <span className="mx-auto mt-7 grid h-14 w-14 place-items-center rounded-full bg-success-soft text-success">
                <Check className="h-7 w-7" />
              </span>
              <h1 className="mt-5 text-2xl font-extrabold">{MESSAGES[result].title}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {result === "BOUND" && partner ? `${partnerTitle(partner)} ${MESSAGES.BOUND.body}` : MESSAGES[result].body}
              </p>
              <ActionButton variant="primary" size="md" className="mt-6" onClick={() => navigate({ to: "/tests" })}>
                Book a test
              </ActionButton>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
