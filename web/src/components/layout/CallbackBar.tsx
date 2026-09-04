import { useState } from "react";
import { PhoneCall, X } from "lucide-react";
import { ApiError, callbackRequestsApi } from "@/lib/api";

export function CallbackBar() {
  const [closed, setClosed] = useState(false);
  const [phone, setPhone] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (closed) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[6-9]\d{9}$/.test(phone.trim())) {
      setError("Enter a valid 10-digit mobile number");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await callbackRequestsApi.submit(phone.trim());
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't submit — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 bg-primary text-primary-foreground shadow-[0_-8px_30px_oklch(0_0_0/0.15)]">
      <div className="container-page flex flex-col items-center gap-3 py-3 sm:flex-row sm:justify-center">
        <p className="flex items-center gap-2 text-sm font-bold">
          <PhoneCall className="h-4 w-4" /> Get a callback from our health advisor
        </p>
        {done ? (
          <p className="text-sm font-semibold">Thanks! We will call you within 10 minutes.</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex w-full max-w-md flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
            <div className="flex w-full items-center gap-2">
              <input
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value.replace(/\D/g, "").slice(0, 10));
                  setError("");
                }}
                inputMode="tel"
                aria-label="Mobile number"
                placeholder="Enter your 10 digit mobile no."
                className="h-11 w-full min-w-0 rounded-md bg-card px-4 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <button
                type="submit"
                disabled={submitting}
                className="h-11 shrink-0 rounded-md bg-secondary px-5 text-sm font-bold text-secondary-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-60"
              >
                {submitting ? "Sending…" : "Get a Call Back"}
              </button>
            </div>
            {error ? <p className="text-xs font-semibold text-warning">{error}</p> : null}
          </form>
        )}
      </div>
      <button
        aria-label="Dismiss callback bar"
        onClick={() => setClosed(true)}
        className="absolute top-2 right-3 opacity-70 hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
