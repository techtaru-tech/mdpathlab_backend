import { useEffect, useRef, useState } from "react";
import { PhoneCall, X } from "lucide-react";
import { ApiError, callbackRequestsApi } from "@/lib/api";
import { INVALID_MOBILE_MESSAGE, isGenuineIndianMobile } from "@/lib/mobileNumber";

// Remembered for this browser tab, so a closed bar stays closed while the visitor moves between pages.
const CLOSED_KEY = "mdpathlabs_callback_closed";

export function CallbackBar() {
  const [closed, setClosed] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const [phone, setPhone] = useState("");
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Read after mount (not during render) so the server-rendered page and the first client render match.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(CLOSED_KEY) === "1") setClosed(true);
    } catch {
      /* storage blocked — the bar simply starts open */
    }
  }, []);

  // Tells the page how much room the bar takes at the bottom — the footer pads by this.
  useEffect(() => {
    const root = document.documentElement;
    const bar = barRef.current;
    if (closed || !bar) {
      // Closed: only the round call button is left. On phones the footer text runs full width, so leave room for it;
      // on wider screens the footer's last row already keeps clear of that corner.
      const phone = window.matchMedia("(max-width: 639px)");
      const set = () => root.style.setProperty("--callback-bar-h", phone.matches ? "64px" : "0px");
      set();
      phone.addEventListener("change", set);
      return () => phone.removeEventListener("change", set);
    }
    const update = () => root.style.setProperty("--callback-bar-h", `${bar.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [closed]);

  function setClosedAndRemember(value: boolean) {
    setClosed(value);
    try {
      if (value) sessionStorage.setItem(CLOSED_KEY, "1");
      else sessionStorage.removeItem(CLOSED_KEY);
    } catch {
      /* not remembered — fine */
    }
  }

  // Closed: a round call button stays in the bottom corner and brings the bar back.
  if (closed) {
    return (
      <button
        type="button"
        onClick={() => setClosedAndRemember(false)}
        aria-label="Get a call back"
        title="Get a call back"
        className="fixed right-4 bottom-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-secondary text-secondary-foreground shadow-[var(--shadow-cta)] transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-4 focus-visible:ring-secondary/40 sm:right-6 sm:bottom-6"
      >
        <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-secondary/40 [animation-iteration-count:3]" />
        <PhoneCall className="relative h-6 w-6" />
      </button>
    );
  }

  const valid = isGenuineIndianMobile(phone);
  // Checked as the person types: once all 10 digits are in (or they leave the field / press the button),
  // a number that fails the rules shows the message and the request is never sent.
  const showInvalid = !valid && (phone.length === 10 || (touched && phone.length > 0));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!valid) {
      setError("");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await callbackRequestsApi.submit(phone);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't submit — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  const message = showInvalid ? INVALID_MOBILE_MESSAGE : error;

  return (
    <div ref={barRef} className="fixed inset-x-0 bottom-0 z-40 bg-primary text-primary-foreground shadow-[0_-8px_30px_oklch(0_0_0/0.15)]">
      <div className="container-page flex flex-col items-center gap-3 py-3 sm:flex-row sm:justify-center">
        <p className="flex items-center gap-2 text-sm font-bold">
          <PhoneCall className="h-4 w-4" /> Get a callback from our health advisor
        </p>
        {done ? (
          <p className="text-sm font-semibold">Thanks! We will call you within 10 minutes.</p>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="flex w-full max-w-md flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
            <div className="flex w-full items-center gap-2">
              <div
                className={
                  "flex h-11 w-full min-w-0 items-center rounded-md bg-card text-sm font-medium text-foreground " +
                  (showInvalid ? "ring-2 ring-warning" : "")
                }
              >
                <span className="border-r border-border px-3 font-bold text-muted-foreground">+91</span>
                <input
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value.replace(/\D/g, "").slice(0, 10));
                    setError("");
                  }}
                  onBlur={() => setTouched(true)}
                  inputMode="numeric"
                  autoComplete="tel-national"
                  maxLength={10}
                  aria-label="Mobile number"
                  aria-invalid={showInvalid}
                  placeholder="Enter your 10 digit mobile no."
                  className="h-full w-full min-w-0 bg-transparent px-3 placeholder:text-muted-foreground focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={submitting || !valid}
                className="h-11 shrink-0 rounded-md bg-secondary px-5 text-sm font-bold text-secondary-foreground transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
              >
                {submitting ? "Sending…" : "Get a Call Back"}
              </button>
            </div>
            {message ? (
              <p role="alert" className="text-xs font-semibold text-warning">
                {message}
              </p>
            ) : null}
          </form>
        )}
      </div>
      <button
        aria-label="Dismiss callback bar"
        // Keeps focus in the number field: blurring it would show the "invalid number" line, grow the bar and move
        // this button out from under the pointer before the click lands.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setClosedAndRemember(true)}
        className="absolute top-2 right-3 opacity-70 hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
