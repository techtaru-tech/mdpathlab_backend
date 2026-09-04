import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, FileText, Globe, ImageOff, ScrollText } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { AdminApiError, adminSettingsApi, type AdminSiteSettings } from "@/lib/admin-api";
import { apiFileUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({ meta: [{ title: "Settings — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminSettingsPage,
});

const tabs = [
  { id: "general", label: "General", icon: Globe },
  { id: "privacy", label: "Privacy Policy", icon: FileText },
  { id: "terms", label: "Terms & Conditions", icon: ScrollText },
  { id: "payment", label: "Payment", icon: CreditCard },
] as const;

type TabId = (typeof tabs)[number]["id"];

function ImageField({
  label,
  currentUrl,
  onChange,
}: {
  label: string;
  currentUrl: string | null;
  onChange: (file: File | null) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);

  return (
    <div>
      <span className="mb-1.5 block text-xs font-bold text-muted-foreground uppercase">{label}</span>
      <div className="flex items-center gap-3">
        {preview || currentUrl ? (
          <img
            src={preview ?? apiFileUrl(currentUrl!)}
            alt={label}
            className="h-16 w-16 shrink-0 rounded-lg border border-border object-contain bg-muted"
          />
        ) : (
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-lg border border-dashed border-border text-muted-foreground">
            <ImageOff className="h-5 w-5" />
          </span>
        )}
        <label className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 text-xs font-semibold text-primary hover:bg-primary-soft">
          Upload
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              onChange(file);
              setPreview(file ? URL.createObjectURL(file) : null);
            }}
          />
        </label>
      </div>
    </div>
  );
}

function AdminSettingsPage() {
  const [tab, setTab] = useState<TabId>("general");
  const [settings, setSettings] = useState<AdminSiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  // General tab
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [appStoreUrl, setAppStoreUrl] = useState("");
  const [playStoreUrl, setPlayStoreUrl] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [favicon, setFavicon] = useState<File | null>(null);
  const [banner, setBanner] = useState<File | null>(null);

  // Legal tabs
  const [privacyPolicyContent, setPrivacyPolicyContent] = useState("");
  const [termsConditionsContent, setTermsConditionsContent] = useState("");

  // Payment tab
  const [razorpayKeyId, setRazorpayKeyId] = useState("");
  const [razorpayKeySecret, setRazorpayKeySecret] = useState("");
  const [razorpayWebhookSecret, setRazorpayWebhookSecret] = useState("");
  const [onlinePaymentEnabled, setOnlinePaymentEnabled] = useState(true);
  const [codEnabled, setCodEnabled] = useState(true);

  useEffect(() => {
    adminSettingsApi
      .get()
      .then((s) => {
        setSettings(s);
        setAddress(s.address ?? "");
        setEmail(s.email ?? "");
        setPhone(s.phone ?? "");
        setAppStoreUrl(s.appStoreUrl ?? "");
        setPlayStoreUrl(s.playStoreUrl ?? "");
        setPrivacyPolicyContent(s.privacyPolicyContent ?? "");
        setTermsConditionsContent(s.termsConditionsContent ?? "");
        setRazorpayKeyId(s.razorpayKeyId ?? "");
        setOnlinePaymentEnabled(s.onlinePaymentEnabled);
        setCodEnabled(s.codEnabled);
      })
      .finally(() => setLoading(false));
  }, []);

  async function save(patch: Parameters<typeof adminSettingsApi.update>[0]) {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const updated = await adminSettingsApi.update(patch);
      setSettings(updated);
      setLogo(null);
      setFavicon(null);
      setBanner(null);
      setRazorpayKeySecret("");
      setRazorpayWebhookSecret("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Couldn't save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !settings) {
    return (
      <AdminLayout activePath="/admin/settings">
        <AdminPageHeader title="Settings" description="Loading…" />
        <div className="mt-6 h-64 animate-pulse rounded-2xl bg-muted" />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout activePath="/admin/settings">
      <AdminPageHeader title="Settings" description="Site details, legal pages and payment configuration" />

      <div className="mt-6 flex gap-2 overflow-x-auto border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition-colors",
              tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {error ? <p className="mt-4 text-xs font-semibold text-destructive">{error}</p> : null}
      {saved ? <p className="mt-4 text-xs font-semibold text-success">Saved.</p> : null}

      {tab === "general" ? (
        <div className="mt-6 grid gap-5 rounded-2xl border border-border bg-card p-6 shadow-sm sm:grid-cols-2">
          <ImageField label="Logo" currentUrl={settings.logoUrl} onChange={setLogo} />
          <ImageField label="Favicon" currentUrl={settings.faviconUrl} onChange={setFavicon} />
          <div className="sm:col-span-2">
            <ImageField label="Homepage Banner" currentUrl={settings.bannerUrl} onChange={setBanner} />
          </div>

          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs font-bold text-muted-foreground uppercase">Address</span>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-muted-foreground uppercase">Email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 w-full rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-muted-foreground uppercase">Phone</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-11 w-full rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-muted-foreground uppercase">Play Store URL</span>
            <input
              value={playStoreUrl}
              onChange={(e) => setPlayStoreUrl(e.target.value)}
              placeholder="https://play.google.com/store/apps/details?id=..."
              className="h-11 w-full rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-muted-foreground uppercase">App Store URL</span>
            <input
              value={appStoreUrl}
              onChange={(e) => setAppStoreUrl(e.target.value)}
              placeholder="https://apps.apple.com/app/..."
              className="h-11 w-full rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
            />
          </label>

          <div className="sm:col-span-2">
            <ActionButton
              type="button"
              variant="primary"
              size="sm"
              disabled={saving}
              onClick={() => save({ address, email, phone, appStoreUrl, playStoreUrl, ...(logo ? { logo } : {}), ...(favicon ? { favicon } : {}), ...(banner ? { banner } : {}) })}
            >
              {saving ? "Saving…" : "Save general settings"}
            </ActionButton>
          </div>
        </div>
      ) : null}

      {tab === "privacy" ? (
        <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <span className="mb-1.5 block text-xs font-bold text-muted-foreground uppercase">
            Privacy Policy content
          </span>
          <textarea
            value={privacyPolicyContent}
            onChange={(e) => setPrivacyPolicyContent(e.target.value)}
            rows={18}
            placeholder="Separate paragraphs with a blank line — shown as-is on /privacy-policy"
            className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm focus:outline-none"
          />
          <div className="mt-4">
            <ActionButton type="button" variant="primary" size="sm" disabled={saving} onClick={() => save({ privacyPolicyContent })}>
              {saving ? "Saving…" : "Save privacy policy"}
            </ActionButton>
          </div>
        </div>
      ) : null}

      {tab === "terms" ? (
        <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <span className="mb-1.5 block text-xs font-bold text-muted-foreground uppercase">
            Terms & Conditions content
          </span>
          <textarea
            value={termsConditionsContent}
            onChange={(e) => setTermsConditionsContent(e.target.value)}
            rows={18}
            placeholder="Separate paragraphs with a blank line — shown as-is on /terms-conditions"
            className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm focus:outline-none"
          />
          <div className="mt-4">
            <ActionButton type="button" variant="primary" size="sm" disabled={saving} onClick={() => save({ termsConditionsContent })}>
              {saving ? "Saving…" : "Save terms & conditions"}
            </ActionButton>
          </div>
        </div>
      ) : null}

      {tab === "payment" ? (
        <div className="mt-6 grid gap-5 rounded-2xl border border-border bg-card p-6 shadow-sm sm:grid-cols-2">
          <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted px-4 py-3 sm:col-span-2">
            <span>
              <span className="block text-sm font-bold">Online payment (Razorpay)</span>
              <span className="block text-xs text-muted-foreground">
                When off, patients can only book with Cash on Delivery
              </span>
            </span>
            <input
              type="checkbox"
              checked={onlinePaymentEnabled}
              onChange={(e) => setOnlinePaymentEnabled(e.target.checked)}
              className="h-5 w-5 accent-primary"
            />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted px-4 py-3 sm:col-span-2">
            <span>
              <span className="block text-sm font-bold">Cash on Delivery</span>
              <span className="block text-xs text-muted-foreground">
                When off, patients can only book with online payment
              </span>
            </span>
            <input
              type="checkbox"
              checked={codEnabled}
              onChange={(e) => setCodEnabled(e.target.checked)}
              className="h-5 w-5 accent-primary"
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs font-bold text-muted-foreground uppercase">Razorpay Key ID</span>
            <input
              value={razorpayKeyId}
              onChange={(e) => setRazorpayKeyId(e.target.value)}
              placeholder="rzp_live_..."
              className="h-11 w-full rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-muted-foreground uppercase">Razorpay Key Secret</span>
            <input
              type="password"
              value={razorpayKeySecret}
              onChange={(e) => setRazorpayKeySecret(e.target.value)}
              placeholder={settings.razorpayKeySecret ? "Configured — leave blank to keep unchanged" : "Not set"}
              className="h-11 w-full rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-muted-foreground uppercase">Razorpay Webhook Secret</span>
            <input
              type="password"
              value={razorpayWebhookSecret}
              onChange={(e) => setRazorpayWebhookSecret(e.target.value)}
              placeholder={settings.razorpayWebhookSecret ? "Configured — leave blank to keep unchanged" : "Not set"}
              className="h-11 w-full rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
            />
          </label>

          <div className="sm:col-span-2">
            <ActionButton
              type="button"
              variant="primary"
              size="sm"
              disabled={saving}
              onClick={() =>
                save({
                  onlinePaymentEnabled,
                  codEnabled,
                  ...(razorpayKeyId ? { razorpayKeyId } : {}),
                  ...(razorpayKeySecret ? { razorpayKeySecret } : {}),
                  ...(razorpayWebhookSecret ? { razorpayWebhookSecret } : {}),
                })
              }
            >
              {saving ? "Saving…" : "Save payment settings"}
            </ActionButton>
          </div>
        </div>
      ) : null}
    </AdminLayout>
  );
}
