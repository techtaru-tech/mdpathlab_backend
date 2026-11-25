import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, QrCode } from "lucide-react";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { ApiError } from "@/lib/api";
import { phlebotomistOrdersApi, type CollectionUpiQr } from "@/lib/phlebotomist-api";

/**
 * Payment at the door by UPI: a single-use Razorpay QR for the exact amount, paid into the MD Path Labs account.
 * The booking is marked paid only when Razorpay confirms — this panel checks every few seconds.
 */
export function UpiQrPanel({ orderId, onPaid }: { orderId: string; onPaid: () => void }) {
  const [qr, setQr] = useState<CollectionUpiQr | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());

  async function show() {
    setLoading(true);
    setError("");
    try {
      setQr(await phlebotomistOrdersApi.createUpiQr(orderId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the QR — please try again");
    } finally {
      setLoading(false);
    }
  }

  const waiting = qr?.status === "ACTIVE" && new Date(qr.expiresAt).getTime() > now;

  useEffect(() => {
    if (!qr || !waiting) return;
    const t = setInterval(async () => {
      setNow(Date.now());
      try {
        const s = await phlebotomistOrdersApi.upiQrStatus(orderId, qr.id);
        setQr(s);
        if (s.status === "PAID") onPaid();
      } catch {
        /* keep polling */
      }
    }, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qr?.id, waiting]);

  if (!qr) {
    return (
      <div>
        <ActionButton variant="primary" size="md" className="w-full" disabled={loading} onClick={show}>
          <QrCode className="h-4 w-4" /> {loading ? "Creating QR…" : "Show UPI QR to patient"}
        </ActionButton>
        {error ? <p className="mt-2 text-xs font-semibold text-destructive">{error}</p> : null}
      </div>
    );
  }

  if (qr.status === "PAID") {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-success/10 p-3 text-sm font-bold text-success">
        <CheckCircle2 className="h-5 w-5" /> ₹{qr.amount} received by UPI
      </p>
    );
  }

  const minsLeft = Math.max(0, Math.ceil((new Date(qr.expiresAt).getTime() - now) / 60000));
  return (
    <div className="text-center">
      <p className="text-sm font-bold">Ask the patient to scan and pay ₹{qr.amount}</p>
      <p className="text-xs text-muted-foreground">PhonePe, Google Pay, Paytm or any UPI app · MD Path Labs</p>
      <img src={qr.imageUrl} alt={`UPI QR for ₹${qr.amount}`} className="mx-auto mt-3 w-full max-w-[300px] rounded-xl border border-border bg-white" />
      {waiting ? (
        <p className="mt-3 flex items-center justify-center gap-2 text-xs font-semibold text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for payment… (valid {minsLeft} more min)
        </p>
      ) : (
        <div className="mt-3">
          <p className="text-xs font-semibold text-destructive">This QR has expired.</p>
          <ActionButton variant="outline" size="sm" className="mt-2" disabled={loading} onClick={show}>
            Show a new QR
          </ActionButton>
        </div>
      )}
    </div>
  );
}
