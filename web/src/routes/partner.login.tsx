import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Building2, Check, Phone, ShieldCheck, Stethoscope } from "lucide-react";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { PartnerPortalClosed, usePartnerPortalEnabled } from "@/components/partner/PartnerLayout";
import { PartnerApiError, partnerApi, partnerSession, type PartnerType } from "@/lib/partner-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/partner/login")({
  head: () => ({ meta: [{ title: "Doctors & Clinics — Sign in — MD Path Lab" }, { name: "robots", content: "noindex" }] }),
  component: PartnerLoginPage,
});

const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;

type Step = "phone" | "otp" | "success";

function PartnerLoginPage() {
  const enabled = usePartnerPortalEnabled();
  const navigate = useNavigate();
  const [type, setType] = useState<PartnerType>("DOCTOR");
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [otpError, setOtpError] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(RESEND_SECONDS);
  const [devCode, setDevCode] = useState<string | null>(null);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const otpRef = useRef<string[]>(otp);

  const setOtpBoth = (value: string[]) => {
    otpRef.current = value;
    setOtp(value);
  };

  useEffect(() => {
    if (step !== "otp" || resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [step, resendIn]);

  if (enabled === false) return <PartnerPortalClosed />;
  if (enabled === null) return <section className="min-h-[60vh]" />;

  const sendOtp = async () => {
    if (!/^[6-9]\d{9}$/.test(phone)) {
      setPhoneError("Enter a valid 10-digit mobile number");
      return;
    }
    // Asked up front: the server checks the OTP before it says whether the terms were needed, so missing it later
    // would cost the person a new code.
    if (!termsAccepted) {
      setPhoneError("Please accept the Terms & Conditions and Privacy Policy to continue");
      return;
    }
    setPhoneError("");
    setSending(true);
    try {
      const res = await partnerApi.requestOtp(phone);
      setDevCode(res.devCode ?? null);
      setStep("otp");
      setResendIn(RESEND_SECONDS);
      setOtpBoth(Array(OTP_LENGTH).fill(""));
      setTimeout(() => inputsRef.current[0]?.focus(), 50);
    } catch (err) {
      setPhoneError(err instanceof PartnerApiError ? err.message : "Couldn't send OTP — please try again");
    } finally {
      setSending(false);
    }
  };

  const resendOtp = async () => {
    if (resendIn > 0) return;
    setOtpError("");
    try {
      const res = await partnerApi.requestOtp(phone);
      setDevCode(res.devCode ?? null);
      setResendIn(RESEND_SECONDS);
      setOtpBoth(Array(OTP_LENGTH).fill(""));
      inputsRef.current[0]?.focus();
    } catch (err) {
      setOtpError(err instanceof PartnerApiError ? err.message : "Couldn't resend OTP — please try again");
    }
  };

  const verifyOtp = async (code: string) => {
    if (code.length < OTP_LENGTH) {
      setOtpError("Enter the complete 6-digit code");
      return;
    }
    setVerifying(true);
    try {
      const res = await partnerApi.verifyOtp(phone, code, type, termsAccepted);
      partnerSession.save(res.accessToken, res.partner);
      setStep("success");
      setTimeout(() => navigate({ to: "/partner" }), 600);
    } catch (err) {
      setOtpError(err instanceof PartnerApiError ? err.message : "Couldn't verify OTP — please try again");
      setOtpBoth(Array(OTP_LENGTH).fill(""));
      inputsRef.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  };

  const updateOtp = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...otpRef.current];
    next[index] = digit;
    setOtpBoth(next);
    setOtpError("");
    if (digit && index < OTP_LENGTH - 1) inputsRef.current[index + 1]?.focus();
    if (digit && next.every((d) => d)) verifyOtp(next.join(""));
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otpRef.current[index] && index > 0) inputsRef.current[index - 1]?.focus();
  };

  return (
    // A standalone sign-in like the admin panel's — the portal has no website header or footer.
    <section className="relative flex min-h-screen items-center overflow-hidden bg-muted/40 py-12">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-gradient-to-b from-primary via-primary/70 to-transparent" />

      <div className="container-page relative mx-auto w-full max-w-md">
        <a href="/" className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-primary-foreground/90 hover:text-primary-foreground">
          ← Back to MD Path Lab website
        </a>
        <div className="surface-card p-8 shadow-[var(--shadow-lift)]">
          <div className="mx-auto flex w-fit items-center gap-2.5">
            <img src="/logo.png" alt="MD Path Lab" className="h-11 w-11 rounded-full object-contain" />
            <span className="text-xl font-extrabold tracking-tight text-primary">
              MD <span className="text-secondary">Path Lab</span>
            </span>
          </div>
          <p className="mt-1 text-center text-[11px] font-bold tracking-wide text-muted-foreground uppercase">For Doctors &amp; Clinics</p>

          {step === "phone" ? (
            <>
              <h1 className="mt-6 text-center text-2xl font-extrabold">Sign in or register</h1>
              <p className="mt-2 text-center text-sm text-muted-foreground">We'll send a one-time code to your mobile number.</p>

              <div className="mt-6 grid grid-cols-2 gap-2" role="radiogroup" aria-label="I am a">
                {(
                  [
                    { value: "DOCTOR", label: "Doctor", icon: Stethoscope },
                    { value: "CLINIC", label: "Clinic / Hospital", icon: Building2 },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={type === o.value}
                    onClick={() => setType(o.value)}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-bold transition-colors",
                      type === o.value ? "border-primary bg-primary-soft text-primary" : "border-border text-foreground/75 hover:bg-muted",
                    )}
                  >
                    <o.icon className="h-4 w-4" /> {o.label}
                  </button>
                ))}
              </div>

              <label className="mt-5 block">
                <span className="mb-2 block text-xs font-bold tracking-wide text-muted-foreground uppercase">Mobile number</span>
                <div className={cn("flex items-center gap-3 rounded-xl border bg-muted px-4", phoneError ? "border-destructive" : "border-border")}>
                  <span className="flex items-center gap-1.5 border-r border-border py-3.5 pr-3 text-sm font-bold text-muted-foreground">
                    <Phone className="h-4 w-4" /> +91
                  </span>
                  <input
                    inputMode="numeric"
                    autoFocus
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value.replace(/\D/g, "").slice(0, 10));
                      setPhoneError("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && sendOtp()}
                    placeholder="98765 43210"
                    aria-label="Mobile number"
                    className="w-full min-w-0 bg-transparent py-3.5 text-sm font-semibold placeholder:font-medium placeholder:text-muted-foreground focus:outline-none"
                  />
                </div>
                {phoneError ? <p className="mt-2 text-xs font-semibold text-destructive">{phoneError}</p> : null}
              </label>

              <label className="mt-4 flex items-start gap-2.5 text-xs text-muted-foreground">
                <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} className="mt-0.5" />
                <span>
                  I agree to the{" "}
                  <a href="/terms-conditions" target="_blank" rel="noreferrer" className="font-bold text-primary hover:underline">
                    Terms &amp; Conditions
                  </a>{" "}
                  and{" "}
                  <a href="/privacy-policy" target="_blank" rel="noreferrer" className="font-bold text-primary hover:underline">
                    Privacy Policy
                  </a>
                </span>
              </label>

              <ActionButton variant="primary" size="lg" className="mt-6 w-full" onClick={sendOtp} disabled={sending}>
                {sending ? "Sending OTP…" : "Send OTP"}
              </ActionButton>

              <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" /> New here? Signing in starts your application.
              </p>
            </>
          ) : null}

          {step === "otp" ? (
            <>
              <button type="button" onClick={() => setStep("phone")} className="mt-6 text-xs font-bold text-primary hover:underline">
                ← Change number
              </button>
              <h1 className="mt-4 text-center text-2xl font-extrabold">Verify your number</h1>
              <p className="mt-2 text-center text-sm text-muted-foreground">
                Enter the 6-digit code sent to <span className="font-bold text-foreground">+91 {phone}</span>
              </p>
              {devCode ? <p className="mt-3 text-center text-xs font-semibold text-warning">Dev mode — OTP is {devCode} (SMS not configured)</p> : null}

              <div className="mt-7 flex justify-center gap-2 sm:gap-3">
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      inputsRef.current[i] = el;
                    }}
                    inputMode="numeric"
                    value={digit}
                    onChange={(e) => updateOtp(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    aria-label={`Digit ${i + 1}`}
                    maxLength={1}
                    className={cn(
                      "h-12 w-10 rounded-xl border bg-muted text-center text-lg font-extrabold focus:border-primary focus:outline-none sm:h-14 sm:w-12",
                      otpError ? "border-destructive" : "border-border",
                    )}
                  />
                ))}
              </div>
              {otpError ? <p className="mt-3 text-center text-xs font-semibold text-destructive">{otpError}</p> : null}

              <div className="mt-5 text-center text-xs font-semibold text-muted-foreground">
                {resendIn > 0 ? (
                  <span>Resend code in {resendIn}s</span>
                ) : (
                  <button type="button" onClick={resendOtp} className="font-bold text-primary hover:underline">
                    Resend OTP
                  </button>
                )}
              </div>

              <ActionButton variant="primary" size="lg" className="mt-6 w-full" onClick={() => verifyOtp(otp.join(""))} disabled={verifying}>
                {verifying ? "Verifying…" : "Verify & continue"}
              </ActionButton>
            </>
          ) : null}

          {step === "success" ? (
            <div className="text-center">
              <span className="mx-auto mt-7 grid h-14 w-14 place-items-center rounded-full bg-success-soft text-success">
                <Check className="h-7 w-7" />
              </span>
              <h1 className="mt-5 text-2xl font-extrabold">Signed in</h1>
              <p className="mt-2 text-sm text-muted-foreground">Taking you to your account…</p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
