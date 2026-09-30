import { useEffect, useState } from "react";
import { Trash2, Upload } from "lucide-react";
import { AdminApiError, adminAppBannersApi, type AdminAppBanner } from "@/lib/admin-api";
import { apiFileUrl } from "@/lib/api";

// Banner carousel shown at the top of the customer mobile app's Home screen. Each banner is one
// finished design image — the app shows it as-is, so any text must be baked into the picture.
export function AppBannersPanel() {
  const [banners, setBanners] = useState<AdminAppBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    adminAppBannersApi
      .list()
      .then(setBanners)
      .catch(() => setError("Couldn't load banners"))
      .finally(() => setLoading(false));
  }, []);

  async function handleUpload(file: File | null) {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const created = await adminAppBannersApi.create(file, banners.length);
      setBanners((prev) => [...prev, created]);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Couldn't upload banner");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(b: AdminAppBanner) {
    setBusy(true);
    try {
      const updated = await adminAppBannersApi.update(b.id, { status: b.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" });
      setBanners((prev) => prev.map((x) => (x.id === b.id ? updated : x)));
    } finally {
      setBusy(false);
    }
  }

  async function remove(b: AdminAppBanner) {
    if (!window.confirm("Delete this banner?")) return;
    setBusy(true);
    try {
      await adminAppBannersApi.remove(b.id);
      setBanners((prev) => prev.filter((x) => x.id !== b.id));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-extrabold">App home banners</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Shown at the top of the mobile app&apos;s Home screen, in this order. Upload finished design images (JPEG, PNG or
            WebP, max 5 MB) — the app shows them as-is, so put any text inside the image. Up to 5 active banners are shown.
          </p>
        </div>
        <label
          className={`flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-4 text-xs font-semibold text-primary hover:bg-primary-soft ${busy ? "pointer-events-none opacity-60" : ""}`}
        >
          <Upload className="h-4 w-4" /> Upload banner
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => {
              void handleUpload(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {error ? <p className="mt-3 text-xs font-semibold text-destructive">{error}</p> : null}

      {loading ? (
        <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
      ) : banners.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No app banners yet — upload one above.</p>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {banners.map((b) => (
            <div key={b.id} className="overflow-hidden rounded-xl border border-border">
              <img
                src={apiFileUrl(b.imageUrl)}
                alt="App banner"
                className={`aspect-[3/2] w-full bg-muted object-cover ${b.status === "ACTIVE" ? "" : "opacity-40"}`}
              />
              <div className="flex items-center justify-between gap-2 p-3">
                <span className={`text-xs font-bold ${b.status === "ACTIVE" ? "text-success" : "text-muted-foreground"}`}>
                  {b.status === "ACTIVE" ? "Showing in app" : "Hidden"}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => toggle(b)}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold hover:border-primary/40 hover:text-primary disabled:opacity-60"
                  >
                    {b.status === "ACTIVE" ? "Hide" : "Show"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => remove(b)}
                    aria-label="Delete banner"
                    className="grid h-8 w-8 place-items-center rounded-lg border border-border text-foreground/70 hover:border-destructive/40 hover:text-destructive disabled:opacity-60"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
