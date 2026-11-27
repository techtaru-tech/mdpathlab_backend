import { useState } from "react";
import { CheckCircle2, Download, FileSignature, ShieldCheck } from "lucide-react";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { PartnerApiError, partnerEarningsApi, type PartnerMou } from "@/lib/partner-api";
import { cn } from "@/lib/utils";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
const rates = (m: PartnerMou) => `Routine ${m.routinePercent}% · Special ${m.specialPercent}% · Package ${m.packagePercent}%`;
const errorText = (err: unknown, fallback: string) => (err instanceof PartnerApiError ? err.message : fallback);

/**
 * Partner portal: the MOU to accept. Read it (download) → tick "I agree" → OTP to the registered mobile → Accept.
 * The rates apply at once. No printing, scanning or waiting for verification.
 */
export function PartnerMouSignCard({ current, pending, onChanged }: { current: PartnerMou | null; pending: PartnerMou | null; onChanged: () => void }) {
  const [agreed, setAgreed] = useState(false);
  const [otpSent, setOtpSent] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState<"download" | "otp" | "accept" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (!pending && !current) return null;
  const mou = pending ?? current!;
  const accepted = mou.signatureStatus === "VERIFIED";

  async function download() {
    setBusy("download");
    setMessage(null);
    try {
      await partnerEarningsApi.downloadMou(mou);
    } catch (err) {
      setMessage({ ok: false, text: errorText(err, "Couldn't download the MOU") });
    } finally {
      setBusy(null);
    }
  }

  async function sendOtp() {
    setBusy("otp");
    setMessage(null);
    try {
      const r = await partnerEarningsApi.sendMouOtp(mou.id);
      setOtpSent(r.message + (r.devCode ? ` (test code ${r.devCode})` : ""));
    } catch (err) {
      setMessage({ ok: false, text: errorText(err, "Couldn't send the OTP") });
    } finally {
      setBusy(null);
    }
  }

  async function accept() {
    if (!/^\d{6}$/.test(otp)) return setMessage({ ok: false, text: "Enter the 6-digit OTP" });
    setBusy("accept");
    setMessage(null);
    try {
      await partnerEarningsApi.acceptMou(mou.id, otp);
      setMessage({ ok: true, text: "MOU accepted — your commission rates are now active." });
      onChanged();
    } catch (err) {
      setMessage({ ok: false, text: errorText(err, "Couldn't accept the MOU") });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={cn("rounded-2xl border p-5 shadow-sm", accepted ? "border-success/30 bg-success/5" : "border-primary/40 bg-primary-soft/50")}>
      <div className="flex items-start gap-3">
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full", accepted ? "bg-success/15 text-success" : "bg-primary/10 text-primary")}>
          {accepted ? <CheckCircle2 className="h-5 w-5" /> : <FileSignature className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Your MOU {mou.mouNumber ? `· ${mou.mouNumber}` : ""}</p>
          <p className="mt-0.5 font-extrabold">{rates(mou)}</p>

          {accepted ? (
            <p className="mt-2 text-sm text-foreground/85">
              Accepted on {fmt(mou.verifiedAt)}. These rates apply to bookings from {fmt(mou.startsAt)}.
            </p>
          ) : (
            <>
              <p className="mt-2 text-sm text-foreground/85">Read the MOU, then accept it with an OTP sent to your registered mobile. Your rates start as soon as you accept.</p>
              <label className="mt-3 flex items-start gap-2 text-sm font-semibold">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
                I have read the MOU and agree to its terms.
              </label>
            </>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <ActionButton size="sm" variant="outline" onClick={download} disabled={busy !== null}>
              <Download className="h-4 w-4" /> {busy === "download" ? "Downloading…" : accepted ? "Download MOU" : "Read MOU (PDF)"}
            </ActionButton>
            {!accepted && !otpSent ? (
              <ActionButton size="sm" variant="navy" onClick={sendOtp} disabled={busy !== null || !agreed}>
                <ShieldCheck className="h-4 w-4" /> {busy === "otp" ? "Sending…" : "Accept with OTP"}
              </ActionButton>
            ) : null}
          </div>

          {!accepted && otpSent ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-semibold text-success">{otpSent}</p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  placeholder="6-digit OTP"
                  className="h-10 w-40 rounded-lg border border-border bg-card px-3 text-sm focus:outline-none"
                />
                <ActionButton size="sm" variant="navy" onClick={accept} disabled={busy !== null}>
                  {busy === "accept" ? "Accepting…" : "Accept MOU"}
                </ActionButton>
                <button type="button" onClick={sendOtp} disabled={busy !== null} className="text-xs font-bold text-primary hover:underline">
                  Resend OTP
                </button>
              </div>
            </div>
          ) : null}
          {message ? <p className={message.ok ? "mt-2 text-sm font-semibold text-success" : "mt-2 text-sm font-semibold text-destructive"}>{message.text}</p> : null}
        </div>
      </div>
    </div>
  );
}
