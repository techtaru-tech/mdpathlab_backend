import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { LocationPickerDialog } from "@/components/LocationPickerDialog";
import { LabApiError, labAuthApi, type LabMe } from "@/lib/lab-api";

/** Lab → Service Areas: the lab sets its own map pin (the additional collection charge is measured from it). */
export function LabLocationCard() {
  const [lab, setLab] = useState<LabMe | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    labAuthApi
      .me()
      .then(setLab)
      .catch(() => setMessage({ ok: false, text: "Couldn't load your lab location" }));
  }, []);

  async function save(lat: number | null, lng: number | null) {
    setSaving(true);
    setMessage(null);
    try {
      setLab(await labAuthApi.setLocation(lat, lng));
      setMessage({ ok: true, text: lat === null ? "Location removed." : "Location saved." });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof LabApiError ? err.message : "Couldn't save the location" });
    } finally {
      setSaving(false);
    }
  }

  const pin = lab && lab.lat != null && lab.lng != null ? { lat: lab.lat, lng: lab.lng } : null;

  return (
    <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-xs font-extrabold tracking-wide text-muted-foreground uppercase">Lab location (map pin)</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Put the pin exactly on your lab. Home collections farther than the free distance from this point get the additional collection charge
        on the patient's bill.
      </p>
      {!lab ? (
        <p className="mt-3 text-sm text-muted-foreground">{message?.text ?? "Loading…"}</p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2 text-sm">
            <MapPin className="h-4 w-4 shrink-0 text-primary" />
            {pin ? (
              <span>
                <span className="font-bold">Location set</span>{" "}
                <a
                  href={`https://www.google.com/maps?q=${pin.lat},${pin.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  ({pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}) — view on map
                </a>
              </span>
            ) : (
              <span className="font-semibold text-warning">Not set yet</span>
            )}
          </span>
          <ActionButton type="button" variant="primary" size="sm" disabled={saving} onClick={() => setOpen(true)}>
            {pin ? "Change location" : "Set location on map"}
          </ActionButton>
          {pin ? (
            <ActionButton type="button" variant="outline" size="sm" disabled={saving} onClick={() => save(null, null)}>
              Remove
            </ActionButton>
          ) : null}
        </div>
      )}
      {message && lab ? <p className={message.ok ? "mt-2 text-xs font-semibold text-success" : "mt-2 text-xs font-semibold text-destructive"}>{message.text}</p> : null}
      <LocationPickerDialog
        open={open}
        onOpenChange={setOpen}
        initial={pin}
        onConfirm={(r) => {
          setOpen(false);
          void save(r.lat, r.lng);
        }}
      />
    </div>
  );
}

/** Lab → Overview: a nudge while the lab has no map pin. */
export function LabLocationReminder() {
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    labAuthApi
      .me()
      .then((l) => setMissing(l.lat == null || l.lng == null))
      .catch(() => {});
  }, []);
  if (!missing) return null;
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-warning/15 p-4 text-sm">
      <span className="flex items-center gap-2 font-semibold">
        <MapPin className="h-4 w-4 shrink-0" /> Your lab's map location isn't set yet — please set it so collection charges are calculated correctly.
      </span>
      <Link to="/lab/service-areas" className="text-xs font-bold text-primary hover:underline">
        Set location →
      </Link>
    </div>
  );
}
