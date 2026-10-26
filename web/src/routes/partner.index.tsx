import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, CalendarCheck, CheckCircle2, Clock, FileText, ShieldOff, Users, Wallet } from "lucide-react";
import { PartnerLayout, PartnerPortalClosed, usePartnerPortalEnabled } from "@/components/partner/PartnerLayout";
import { StatusBadge } from "@/components/admin/StatusBadge";
import {
  PARTNER_STATUS_LABELS,
  PARTNER_STATUS_TONES,
  PartnerApiError,
  formatPaise,
  partnerApi,
  partnerEarningsApi,
  partnerReferralApi,
  type PartnerEarnings,
  type PartnerMe,
  type ReferralKit,
} from "@/lib/partner-api";

export const Route = createFileRoute("/partner/")({
  head: () => ({ meta: [{ title: "Partner Portal — MD Path Lab" }, { name: "robots", content: "noindex" }] }),
  component: PartnerOverviewPage,
});

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
}

function PartnerOverviewPage() {
  const enabled = usePartnerPortalEnabled();
  if (enabled === false) return <PartnerPortalClosed />;
  return (
    <PartnerLayout activePath="/partner">
      {enabled ? <Overview /> : null}
    </PartnerLayout>
  );
}

function Overview() {
  const [me, setMe] = useState<PartnerMe | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    partnerApi
      .me()
      .then(setMe)
      .catch((err) => setError(err instanceof PartnerApiError ? err.message : "Couldn't load your account"));
  }, []);

  if (error) return <p className="text-sm font-semibold text-destructive">{error}</p>;
  if (!me) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const kind = me.type === "DOCTOR" ? "doctor" : "clinic";
  const hasDetails = me.type === "DOCTOR" ? Boolean(me.doctorProfile) : Boolean(me.clinicProfile);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{me.displayName || `Your ${kind} account`}</h1>
          <p className="mt-1 text-sm text-muted-foreground">+91 {me.phone}</p>
        </div>
        <StatusBadge tone={PARTNER_STATUS_TONES[me.status]}>{PARTNER_STATUS_LABELS[me.status]}</StatusBadge>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        {me.status === "DRAFT" ? (
          <StatusPanel icon={FileText} title="Complete your application" tone="text-primary">
            <p>
              Add your {kind === "doctor" ? "professional" : "clinic"} details and upload the required documents, then submit the application for review.
            </p>
            <ul className="mt-3 space-y-1 text-sm">
              <li>{hasDetails ? "✓" : "•"} Details {hasDetails ? "saved" : "not saved yet"}</li>
              <li>
                {me.missingDocuments.length === 0 && hasDetails ? "✓ All required documents uploaded" : `• Still needed: ${me.missingDocuments.join(", ") || "save your details first"}`}
              </li>
            </ul>
            <CTA to="/partner/register" label="Continue application" />
          </StatusPanel>
        ) : null}

        {me.status === "PENDING" ? (
          <StatusPanel icon={Clock} title="Your application is under review" tone="text-warning">
            <p>Submitted on {formatDate(me.submittedAt)}. We'll email you once a decision is made — you can also check back here.</p>
          </StatusPanel>
        ) : null}

        {me.status === "REJECTED" ? (
          <StatusPanel icon={AlertTriangle} title="Your application needs changes" tone="text-destructive">
            {me.lastDecision?.reason ? <p className="font-semibold">Reason: {me.lastDecision.reason}</p> : null}
            <p className="mt-1">Update your details or documents and submit the application again.</p>
            <CTA to="/partner/register" label="Update application" />
          </StatusPanel>
        ) : null}

        {me.status === "APPROVED" ? (
          <StatusPanel icon={CheckCircle2} title="You're an approved partner" tone="text-success">
            <p>Approved on {formatDate(me.decidedAt)}.</p>
            {me.type === "DOCTOR" ? <CTA to="/partner/affiliations" label="Add the clinics you practise at" /> : <CTA to="/partner/affiliations" label="Review doctor requests" />}
          </StatusPanel>
        ) : null}

        {me.status === "SUSPENDED" ? (
          <StatusPanel icon={ShieldOff} title="Your account is suspended" tone="text-destructive">
            {me.lastDecision?.reason ? <p className="font-semibold">Reason: {me.lastDecision.reason}</p> : null}
            <p className="mt-1">Please contact us if you have any questions.</p>
          </StatusPanel>
        ) : null}
      </div>

      {me.status === "APPROVED" ? <ApprovedDashboard /> : null}
    </div>
  );
}

// At-a-glance numbers for an approved partner. Each card only shows when its feature is switched on.
function ApprovedDashboard() {
  const [kit, setKit] = useState<ReferralKit | null>(null);
  const [earnings, setEarnings] = useState<PartnerEarnings | null>(null);

  useEffect(() => {
    partnerReferralApi.kit().then(setKit).catch(() => {});
    partnerEarningsApi.get().then(setEarnings).catch(() => {});
  }, []);

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {kit ? (
        <>
          <DashboardCard to="/partner/referral-kit" icon={Users} value={String(kit.counts.referredPatients)} label="Patients referred" link="Share your link / QR" />
          <DashboardCard to="/partner/referral-kit" icon={CalendarCheck} value={String(kit.counts.attributedBookings)} label="Bookings by your patients" link="Open referral kit" />
        </>
      ) : null}
      {earnings ? (
        <DashboardCard
          to="/partner/earnings"
          icon={Wallet}
          value={formatPaise(Math.max(0, earnings.totals.availablePaise))}
          label="Available to withdraw"
          link={earnings.canWithdraw ? "Withdraw now" : "View earnings"}
        />
      ) : null}
    </div>
  );
}

function DashboardCard({ to, icon: Icon, value, label, link }: { to: "/partner/referral-kit" | "/partner/earnings"; icon: typeof Users; value: string; label: string; link: string }) {
  return (
    <Link to={to} className="group rounded-2xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/40">
      <Icon className="h-5 w-5 text-primary" />
      <p className="mt-2 text-2xl font-extrabold">{value}</p>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-3 text-xs font-bold text-primary group-hover:underline">{link} →</p>
    </Link>
  );
}

function StatusPanel({ icon: Icon, title, tone, children }: { icon: typeof FileText; title: string; tone: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <Icon className={`h-6 w-6 shrink-0 ${tone}`} />
      <div className="min-w-0 text-sm text-foreground/85">
        <h2 className="text-lg font-extrabold text-foreground">{title}</h2>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
}

function CTA({ to, label }: { to: "/partner/register" | "/partner/affiliations"; label: string }) {
  return (
    <Link to={to} className="mt-4 inline-flex rounded-full bg-secondary px-5 py-2.5 text-sm font-bold text-secondary-foreground hover:bg-secondary/90">
      {label}
    </Link>
  );
}
