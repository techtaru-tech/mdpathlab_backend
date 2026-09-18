import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, FlaskConical, ShieldCheck, Truck } from "lucide-react";
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
  const navigate = useNavigate();
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
      if (res.user.isProfileComplete) {
        setStep("success");
      } else {
        navigate({ to: "/register", search: { redirect } });
      }
    } catch (err) {
      setOtpError(err instanceof ApiError ? err.message : "Couldn't verify OTP — please try again");
      setOtpBoth(Array(OTP_LENGTH).fill(""));
      inputsRef.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  };

  return (
    <section className="bg-muted/40 py-10 lg:py-16">
      <div className="container-page">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-2xl font-extrabold sm:text-3xl">
            Welcome to <span className="text-primary">MD Path Lab</span>!
          </h1>
          <div className="mx-auto mt-4 flex max-w-[200px] items-center gap-1.5">
            <span className={cn("h-1 flex-1 rounded-full transition-colors", step === "phone" ? "bg-secondary" : "bg-primary")} />
            <span
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                step === "otp" || step === "success" ? "bg-secondary" : "bg-border",
              )}
            />
          </div>
        </div>

        <div className="surface-card mx-auto mt-8 grid max-w-3xl overflow-hidden p-0 shadow-[var(--shadow-lift)] md:grid-cols-2">
          {/* Left illustration panel — same split-card pattern as the reference, our own brand & copy */}
          <div className="hidden flex-col items-center justify-center gap-5 bg-gradient-to-br from-primary to-secondary p-10 text-center text-primary-foreground md:flex">
            <span className="grid h-28 w-28 place-items-center rounded-full bg-card/15">
              <ShieldCheck className="h-14 w-14" />
            </span>
            <div>
              <h2 className="text-2xl font-extrabold">Trusted & Accurate</h2>
              <p className="mt-2 max-w-[240px] text-sm text-primary-foreground/80">
                NABL &amp; CAP certified labs, free home sample collection and reports verified by an MD Pathologist.
              </p>
            </div>
            <div className="mt-2 flex items-center gap-3 text-xs font-semibold text-primary-foreground/85">
              <span className="flex items-center gap-1.5">
                <Truck className="h-3.5 w-3.5" /> Free home collection
              </span>
              <span className="flex items-center gap-1.5">
                <FlaskConical className="h-3.5 w-3.5" /> 4,500+ tests
              </span>
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={cn("h-1.5 w-1.5 rounded-full", i === 1 ? "bg-card" : "bg-card/40")} />
              ))}
            </div>
          </div>

          {/* Right form panel */}
          <div className="p-8 sm:p-10">
            {step === "phone" ? (
              <>
                <h2 className="text-xl font-extrabold">Login / Sign Up</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">Please enter your mobile number to proceed</p>

                <label className="mt-7 block">
                  <div
                    className={cn(
                      "flex items-center gap-3 rounded-xl border bg-muted px-4",
                      phoneError ? "border-destructive" : "border-border",
                    )}
                  >
                    <span className="flex items-center gap-1.5 border-r border-border py-3.5 pr-3 text-sm font-bold text-muted-foreground">
                      🇮🇳 +91
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
                      placeholder="Enter your mobile number"
                      aria-label="Mobile number"
                      className="w-full min-w-0 bg-transparent py-3.5 text-sm font-semibold placeholder:text-muted-foreground placeholder:font-medium focus:outline-none"
                    />
                  </div>
                  {phoneError ? <p className="mt-2 text-xs font-semibold text-destructive">{phoneError}</p> : null}
                </label>

                <ActionButton variant="primary" size="lg" className="mt-6 w-full" onClick={sendOtp} disabled={sending}>
                  {sending ? "Sending OTP…" : "Login"} {!sending ? <ArrowRight className="h-4 w-4" /> : null}
                </ActionButton>

                <div className="mt-6 flex items-start gap-3 rounded-xl bg-primary-soft p-4">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p className="text-xs font-semibold text-foreground/80">
                    Your number is only used to verify bookings and send report updates — never shared with third parties.
                  </p>
                </div>
              </>
            ) : null}

            {step === "otp" ? (
              <>
                <button
                  type="button"
                  onClick={() => setStep("phone")}
                  className="flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Change number
                </button>

                <h2 className="mt-4 text-xl font-extrabold">Verify your number</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Enter the 6-digit code sent to <span className="font-bold text-foreground">+91 {phone}</span>
                </p>

                {devCode ? (
                  <p className="mt-3 text-xs font-semibold text-warning">
                    Dev mode — OTP is {devCode} (SMS gateway not wired up yet)
                  </p>
                ) : null}

                <div className="mt-7 grid grid-cols-6 gap-2">
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
                        "h-11 w-full rounded-xl border bg-muted text-center text-lg font-extrabold focus:border-primary focus:outline-none",
                        otpError ? "border-destructive" : "border-border",
                      )}
                    />
                  ))}
                </div>
                {otpError ? <p className="mt-3 text-xs font-semibold text-destructive">{otpError}</p> : null}

                <div className="mt-5 text-xs font-semibold text-muted-foreground">
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
              <div className="flex h-full flex-col items-center justify-center text-center">
                <span className="grid h-14 w-14 place-items-center rounded-full bg-success-soft text-success">
                  <Check className="h-7 w-7" />
                </span>
                <h2 className="mt-5 text-xl font-extrabold">Welcome to MD Path Lab</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  You're logged in with +91 {phone}. Book a test or track your reports from your account.
                </p>
                {redirect ? (
                  <a href={redirect} className="mt-7 block w-full">
                    <ActionButton variant="primary" size="lg" className="w-full">
                      Continue
                    </ActionButton>
                  </a>
                ) : (
                  <Link to="/dashboard" className="mt-7 block w-full">
                    <ActionButton variant="primary" size="lg" className="w-full">
                      Continue
                    </ActionButton>
                  </Link>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <p className="mx-auto mt-6 max-w-3xl text-center text-xs text-muted-foreground">
          By proceeding, you agree with our{" "}
          <Link to="/" className="font-semibold text-primary hover:underline">
            Terms and Conditions
          </Link>{" "}
          &amp;{" "}
          <Link to="/" className="font-semibold text-primary hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
