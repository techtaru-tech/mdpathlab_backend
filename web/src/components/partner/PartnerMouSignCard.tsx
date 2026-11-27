import { useRef, useState } from "react";
import { CheckCircle2, Clock, Download, FileSignature, FileText, Upload } from "lucide-react";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { apiFileUrl } from "@/lib/api";
import { PartnerApiError, partnerEarningsApi, type PartnerMou } from "@/lib/partner-api";
import { cn } from "@/lib/utils";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
const rates = (m: PartnerMou) => `Routine ${m.routinePercent}% · Special ${m.specialPercent}% · Package ${m.packagePercent}%`;

/**
 * Partner portal: the MOU to sign. Download → sign (and stamp) → upload the signed copy → MD Path Lab verifies it,
 * and only then do the rates apply.
 */
export function PartnerMouSignCard({ current, pending, onChanged }: { current: PartnerMou | null; pending: PartnerMou | null; onChanged: () => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"download" | "upload" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (!pending && !current) return null;
  const mou = pending ?? current!;

  async function download() {
    setBusy("download");
    setMessage(null);
    try {
      await partnerEarningsApi.downloadMou(mou);
    } catch (err) {
      setMessage({ ok: false, text: err instanceof PartnerApiError ? err.message : "Couldn't download the MOU" });
    } finally {
      setBusy(null);
    }
  }

  async function upload(f: File) {
    setBusy("upload");
    setMessage(null);
    try {
      await partnerEarningsApi.uploadSignedMou(mou.id, f);
      setMessage({ ok: true, text: "Signed MOU uploaded. We'll verify it and let you know." });
      onChanged();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof PartnerApiError ? err.message : "Couldn't upload the file" });
    } finally {
      setBusy(null);
    }
  }

  const status = mou.signatureStatus;
  const needsSignature = status === "AWAITING_SIGNATURE" || status === "REJECTED";
  const Icon = status === "VERIFIED" ? CheckCircle2 : status === "SIGNED_UPLOADED" ? Clock : FileSignature;

  return (
    <div
      className={cn(
        "rounded-2xl border p-5 shadow-sm",
        needsSignature ? "border-primary/40 bg-primary-soft/50" : status === "VERIFIED" ? "border-success/30 bg-success/5" : "border-warning/30 bg-warning/5",
      )}
    >
      <input
        ref={file}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = "";
        }}
      />
      <div className="flex items-start gap-3">
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full", status === "VERIFIED" ? "bg-success/15 text-success" : "bg-primary/10 text-primary")}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Your MOU {mou.mouNumber ? `· ${mou.mouNumber}` : ""}</p>
          <p className="mt-0.5 font-extrabold">{rates(mou)}</p>

          {status === "AWAITING_SIGNATURE" ? (
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-foreground/85">
              <li>Download the MOU.</li>
              <li>Print it, sign it (with your stamp if you have one) and fill in the date and place.</li>
              <li>Upload the signed copy — a PDF or clear photos of the signed pages.</li>
            </ol>
          ) : null}
          {status === "REJECTED" ? (
            <p className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">
              We couldn't accept the signed copy: {mou.rejectionReason ?? "please upload it again"}. Please upload it again.
            </p>
          ) : null}
          {status === "SIGNED_UPLOADED" ? (
            <p className="mt-2 text-sm text-foreground/85">Signed copy received on {fmt(mou.signedUploadedAt)}. We are verifying it — your rates start once it is verified.</p>
          ) : null}
          {status === "VERIFIED" ? (
            <p className="mt-2 text-sm text-foreground/85">
              Verified on {fmt(mou.verifiedAt)}. These rates apply to bookings from {fmt(mou.startsAt)}.
            </p>
          ) : null}
          {needsSignature ? <p className="mt-2 text-xs text-muted-foreground">Your commission rates start once we verify your signed MOU.</p> : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <ActionButton size="sm" variant={needsSignature ? "outline" : "outline"} onClick={download} disabled={busy !== null}>
              <Download className="h-4 w-4" /> {busy === "download" ? "Downloading…" : "Download MOU"}
            </ActionButton>
            {status !== "VERIFIED" ? (
              <ActionButton size="sm" variant="navy" onClick={() => file.current?.click()} disabled={busy !== null}>
                <Upload className="h-4 w-4" /> {busy === "upload" ? "Uploading…" : status === "SIGNED_UPLOADED" ? "Upload again" : "Upload signed MOU"}
              </ActionButton>
            ) : null}
            {mou.documentUrl ? (
              <a href={apiFileUrl(mou.documentUrl)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
                <FileText className="h-3.5 w-3.5" /> Signed copy
              </a>
            ) : null}
          </div>
          {message ? <p className={message.ok ? "mt-2 text-sm font-semibold text-success" : "mt-2 text-sm font-semibold text-destructive"}>{message.text}</p> : null}
        </div>
      </div>
    </div>
  );
}
