import { useEffect, useState } from "react";
import { settingsApi, type SiteSettings } from "@/lib/api";

// No caching here on purpose: the SSR process is long-running and shared across every visitor's
// request, so caching this at module scope would mean an admin's settings change (logo, contact
// info, payment toggles) never shows up again until the server process restarts. Always fetch
// fresh — same as any other loader in this app (e.g. catalogueApi calls).
export function loadSiteSettings(): Promise<SiteSettings | null> {
  return settingsApi.get().catch(() => null);
}

export function useSiteSettings(): SiteSettings | null {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadSiteSettings().then((s) => {
      if (!cancelled) setSettings(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return settings;
}
