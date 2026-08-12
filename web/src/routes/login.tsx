import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, Phone, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { ApiError, authApi, session } from "@/lib/api";
import { cn } from "@/lib/utils";

const title = "Login or Sign up — MD Path Lab";
const description = "Log in with your mobile number to book tests, track samples and view reports.";

export const Route = createFileRoute("/login")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LoginPage,
});

const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;

type Step = "phone" | "otp" | "success";

function LoginPage() {
  const { redirect } = Route.useSearch();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
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

  const sendOtp = async () => {
    if (!/^[6-9]\d{9}$/.test(phone)) {
      setPhoneError("Enter a valid 10-digit mobile number");
      return;
    }
    setPhoneError("");
    setSending(true);
    try {
      const res = await authApi.requestOtp(phone);
      setDevCode(res.devCode ?? null);
      setStep("otp");
      setResendIn(RESEND_SECONDS);
      setOtpBoth(Array(OTP_LENGTH).fill(""));
      setTimeout(() => inputsRef.current[0]?.focus(), 50);
    } catch (err) {
      setPhoneError(err instanceof ApiError ? err.message : "Couldn't send OTP — please try again");
    } finally {
      setSending(false);
    }
  };

  const resendOtp = async () => {
    if (resendIn > 0) return;
    setOtpError("");
    try {
      const res = await authApi.requestOtp(phone);
      setDevCode(res.devCode ?? null);
      setResendIn(RESEND_SECONDS);
      setOtpBoth(Array(OTP_LENGTH).fill(""));
      inputsRef.current[0]?.focus();
    } catch (err) {
      setOtpError(err instanceof ApiError ? err.message : "Couldn't resend OTP — please try again");
    }
  };

  const updateOtp = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...otpRef.current];
    next[index] = digit;
    setOtpBoth(next);
    setOtpError("");
    if (digit && index < OTP_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
    if (digit && next.every((d) => d)) {
      verifyOtp(next.join(""));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otpRef.current[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!digits) return;
    e.preventDefault();
    const next = Array(OTP_LENGTH).fill("");
    digits.split("").forEach((d, i) => (next[i] = d));
    setOtpBoth(next);
    if (digits.length === OTP_LENGTH) {
      verifyOtp(digits);
    } else {
      inputsRef.current[digits.length]?.focus();
    }
  };

  const verifyOtp = async (code: string) => {
    if (code.length < OTP_LENGTH) {
      setOtpError("Enter the complete 6-digit code");
      return;
    }
    setVerifying(true);
    try {
      const res = await authApi.verifyOtp(phone, code);
      session.save(res.accessToken, res.user);
      setStep("success");
    } catch (err) {
      setOtpError(err instanceof ApiError ? err.message : "Couldn't verify OTP — please try again");
      setOtpBoth(Array(OTP_LENGTH).fill(""));
      inputsRef.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  };

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

          {step === "phone" ? (
            <>
              <h1 className="mt-7 text-center text-2xl font-extrabold">Login or Sign up</h1>
              <p className="mt-2 text-center text-sm text-muted-foreground">
                We'll send a one-time code to verify your number.
              </p>

              <label className="mt-7 block">
                <span className="mb-2 block text-xs font-bold tracking-wide text-muted-foreground uppercase">
                  Mobile number
                </span>
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-xl border bg-muted px-4",
                    phoneError ? "border-destructive" : "border-border",
                  )}
                >
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
                    className="w-full min-w-0 bg-transparent py-3.5 text-sm font-semibold placeholder:text-muted-foreground placeholder:font-medium focus:outline-none"
                  />
                </div>
                {phoneError ? <p className="mt-2 text-xs font-semibold text-destructive">{phoneError}</p> : null}
              </label>

              <ActionButton
                variant="primary"
                size="lg"
                className="mt-6 w-full"
                onClick={sendOtp}
                disabled={sending}
              >
                {sending ? "Sending OTP…" : "Send OTP"}
              </ActionButton>

              <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Your number is never shared with third parties
              </p>
            </>
          ) : null}

          {step === "otp" ? (
            <>
              <button
                type="button"
                onClick={() => setStep("phone")}
                className="mt-7 flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Change number
              </button>

              <h1 className="mt-4 text-center text-2xl font-extrabold">Verify your number</h1>
              <p className="mt-2 text-center text-sm text-muted-foreground">
                Enter the 6-digit code sent to <span className="font-bold text-foreground">+91 {phone}</span>
              </p>

              {devCode ? (
                <p className="mt-3 text-center text-xs font-semibold text-warning">
                  Dev mode — OTP is {devCode} (SMS gateway not wired up yet)
                </p>
              ) : null}

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
                    onPaste={handlePaste}
                    aria-label={`Digit ${i + 1}`}
                    maxLength={1}
                    className={cn(
                      "h-12 w-10 rounded-xl border bg-muted text-center text-lg font-extrabold focus:border-primary focus:outline-none sm:h-14 sm:w-12",
                      otpError ? "border-destructive" : "border-border",
                    )}
                  />
                ))}
              </div>
              {otpError ? (
                <p className="mt-3 text-center text-xs font-semibold text-destructive">{otpError}</p>
              ) : null}

              <div className="mt-5 text-center text-xs font-semibold text-muted-foreground">
                {resendIn > 0 ? (
                  <span>Resend code in {resendIn}s</span>
                ) : (
                  <button type="button" onClick={resendOtp} className="font-bold text-primary hover:underline">
                    Resend OTP
                  </button>
                )}
              </div>

              <ActionButton
                variant="primary"
                size="lg"
                className="mt-6 w-full"
                onClick={() => verifyOtp(otp.join(""))}
                disabled={verifying}
              >
                {verifying ? "Verifying…" : "Verify & continue"}
              </ActionButton>
            </>
          ) : null}

          {step === "success" ? (
            <div className="text-center">
              <span className="mx-auto mt-7 grid h-14 w-14 place-items-center rounded-full bg-success-soft text-success">
                <Check className="h-7 w-7" />
              </span>
              <h1 className="mt-5 text-2xl font-extrabold">Welcome to MD Path Lab</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                You're logged in with +91 {phone}. Book a test or track your reports from your account.
              </p>
              {redirect ? (
                <a href={redirect} className="mt-7 block">
                  <ActionButton variant="primary" size="lg" className="w-full">
                    Continue
                  </ActionButton>
                </a>
              ) : (
                <Link to="/dashboard" className="mt-7 block">
                  <ActionButton variant="primary" size="lg" className="w-full">
                    Continue
                  </ActionButton>
                </Link>
              )}
            </div>
          ) : null}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          By continuing, you agree to our{" "}
          <Link to="/" className="font-semibold text-primary hover:underline">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link to="/" className="font-semibold text-primary hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
