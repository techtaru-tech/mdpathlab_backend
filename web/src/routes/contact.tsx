import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Headphones, Mail, MapPin } from "lucide-react";
import { PageHero } from "@/components/ui-kit/PageHero";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { ApiError, contactApi } from "@/lib/api";

const title = "Contact MD Path Lab — 24x7 Health Advisors";
const description =
  "Call our 24x7 helpline, email our support team or request a callback from an MD Path Lab health advisor for test guidance and booking help.";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", email: "", message: "" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await contactApi.submit({
        name: form.name.trim(),
        phone: form.phone.trim(),
        message: form.message.trim(),
        ...(form.email.trim() ? { email: form.email.trim() } : {}),
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send your message — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHero
        crumb="Contact"
        eyebrow="We're here 24x7"
        title="Talk to an MD Path Lab health advisor"
        description="Not sure which test or package you need? Our advisors help you choose, book a slot and understand your report."
      />

      <section className="py-14 lg:py-20">
        <div className="container-page grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-4">
            {[
              { icon: Headphones, label: "24x7 helpline", value: "8400100800" },
              { icon: Mail, label: "Email support", value: "mdpathlabs2021@gmail.com" },
              { icon: MapPin, label: "Reference lab", value: "MD PATHLAB Uttar Pradesh " },
            ].map((c) => (
              <div key={c.label} className="surface-card flex items-center gap-4 p-6">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">
                  <c.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">{c.label}</p>
                  <p className="text-base font-bold">{c.value}</p>
                </div>
              </div>
            ))}
          </div>

          {sent ? (
            <div className="surface-card p-10 text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-success-soft text-success">
                <Check className="h-7 w-7" />
              </span>
              <h2 className="mt-5 text-2xl font-extrabold">Message sent</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                An advisor will call you back within 10 minutes.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="surface-card space-y-4 p-7">
              <h2 className="text-lg font-extrabold">Request a callback</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <input
                  required
                  aria-label="Name"
                  placeholder="Your name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="h-12 rounded-xl border border-border bg-muted px-4 text-sm font-medium focus:outline-none"
                />
                <input
                  required
                  inputMode="tel"
                  aria-label="Mobile number"
                  placeholder="Mobile number"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
                  className="h-12 rounded-xl border border-border bg-muted px-4 text-sm font-medium focus:outline-none"
                />
              </div>
              <input
                aria-label="Email"
                type="email"
                placeholder="Email (optional)"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="h-12 w-full rounded-xl border border-border bg-muted px-4 text-sm font-medium focus:outline-none"
              />
              <textarea
                required
                aria-label="Message"
                rows={5}
                placeholder="Tell us what you need help with…"
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                className="w-full rounded-xl border border-border bg-muted p-4 text-sm font-medium focus:outline-none"
              />
              {error ? <p className="text-xs font-semibold text-destructive">{error}</p> : null}
              <ActionButton variant="primary" size="lg" className="w-full" type="submit" disabled={submitting}>
                {submitting ? "Sending…" : "Request callback"}
              </ActionButton>
            </form>
          )}
        </div>
      </section>
    </>
  );
}
