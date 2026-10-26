import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Copy, Download, Users, CalendarCheck } from "lucide-react";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { PartnerLayout, PartnerPortalClosed, usePartnerPortalEnabled } from "@/components/partner/PartnerLayout";
import { PartnerApiError, partnerReferralApi, type ReferralKit } from "@/lib/partner-api";

export const Route = createFileRoute("/partner/referral-kit")({
  head: () => ({ meta: [{ title: "Referral Kit — MD Path Lab" }, { name: "robots", content: "noindex" }] }),
  component: PartnerReferralKitPage,
});

function PartnerReferralKitPage() {
  const enabled = usePartnerPortalEnabled();
  if (enabled === false) return <PartnerPortalClosed />;
  return <PartnerLayout activePath="/partner/referral-kit">{enabled ? <Kit /> : null}</PartnerLayout>;
}

function Kit() {
  const [kit, setKit] = useState<ReferralKit | null>(null);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    partnerReferralApi
      .kit()
      .then(setKit)
      .catch((err) =>
        setMessage(
          err instanceof PartnerApiError && err.status === 404
            ? "Referral links are not available yet. We'll let you know when they launch."
            : err instanceof PartnerApiError
              ? err.message
              : "Couldn't load your referral kit",
        ),
      );
  }, []);

  async function copy() {
    if (!kit) return;
    try {
      await navigator.clipboard.writeText(kit.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  if (message) return <p className="max-w-xl text-sm text-muted-foreground">{message}</p>;
  if (!kit) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Referral kit</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Share your link or QR code with patients. When a new patient signs up through it, their future bookings are linked to you.
        </p>
      </div>

      <div className="grid gap-6 rounded-2xl border border-border bg-card p-6 shadow-sm sm:grid-cols-[1fr_auto]">
        <div className="min-w-0 space-y-4">
          <div>
            <p className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">Your referral code</p>
            <p className="mt-1 font-mono text-2xl font-extrabold tracking-widest text-primary">{kit.code}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">Your link</p>
            <div className="mt-1 flex items-center gap-2">
              <p className="min-w-0 truncate rounded-lg border border-border bg-muted px-3 py-2 text-sm font-semibold">{kit.link}</p>
              <ActionButton size="sm" variant="outline" onClick={copy}>
                <Copy className="h-4 w-4" /> {copied ? "Copied" : "Copy"}
              </ActionButton>
            </div>
          </div>
        </div>
        <div className="text-center">
          <img src={kit.qrPngDataUrl} alt={`QR code for ${kit.code}`} className="mx-auto h-44 w-44 rounded-lg border border-border bg-white p-1" />
          <a href={kit.qrPngDataUrl} download={`mdpathlabs-referral-${kit.code}.png`} className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline">
            <Download className="h-3.5 w-3.5" /> Download QR
          </a>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <Users className="h-5 w-5 text-primary" />
          <p className="mt-2 text-2xl font-extrabold">{kit.counts.referredPatients}</p>
          <p className="text-xs font-semibold text-muted-foreground">Patients referred</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <CalendarCheck className="h-5 w-5 text-primary" />
          <p className="mt-2 text-2xl font-extrabold">{kit.counts.attributedBookings}</p>
          <p className="text-xs font-semibold text-muted-foreground">Bookings by referred patients</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Only totals are shown. Patients' names, contact details, tests and reports are never shared with partners.
      </p>
    </div>
  );
}
