import { useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Briefcase, Building2, CheckCircle2, ChevronRight, FileText, GraduationCap, IndianRupee, MapPin, Users } from "lucide-react";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { IndiaDialCode } from "@/components/ui-kit/IndiaDialCode";
import { ApiError, careersApi, EMPLOYMENT_TYPE_LABEL } from "@/lib/api";
import { isGenuineIndianMobile } from "@/lib/mobileNumber";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/careers/$slug")({
  loader: async ({ params }) => {
    const job = await careersApi.get(params.slug).catch(() => null);
    if (!job) throw notFound();
    return job;
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Opening not found — MD Path Lab Careers" }, { name: "robots", content: "noindex" }] };
    const t = `${loaderData.title} (${loaderData.location}) — MD Path Lab Careers`;
    const d = loaderData.description.slice(0, 155);
    return {
      meta: [
        { title: t },
        { name: "description", content: d },
        { property: "og:title", content: t },
        { property: "og:description", content: d },
        { property: "og:type", content: "website" },
      ],
    };
  },
  notFoundComponent: () => (
    <section className="py-20">
      <div className="container-page mx-auto max-w-xl text-center">
        <h1 className="text-2xl font-extrabold">This opening is no longer available</h1>
        <p className="mt-2 text-sm text-muted-foreground">It may have been filled or closed. Take a look at our other open roles.</p>
        <Link to="/careers" className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> All openings
        </Link>
      </div>
    </section>
  ),
  component: JobDetailPage,
});

const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const RESUME_ACCEPT = ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const emptyForm = { name: "", phone: "", email: "", city: "", experience: "", message: "" };
const inputCls = "h-12 w-full rounded-xl border bg-muted px-3.5 text-sm focus:border-primary/40 focus:outline-none";

function JobDetailPage() {
  const job = Route.useLoaderData();
  const [form, setForm] = useState(emptyForm);
  const [resume, setResume] = useState<File | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof typeof emptyForm | "resume", string | undefined>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const applyRef = useRef<HTMLElement>(null);

  // The form collapses into the confirmation, so bring it into view — on a phone it would otherwise be off-screen.
  useEffect(() => {
    if (done) applyRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [done]);

  const paragraphs = job.description.split(/\n\s*\n/).filter((p) => p.trim());
  const requirements = (job.requirements ?? "")
    .split("\n")
    .map((r) => r.replace(/^[-•*\s]+/, "").trim())
    .filter(Boolean);

  const set = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = k === "phone" ? e.target.value.replace(/\D/g, "").slice(0, 10) : e.target.value;
    setForm((f) => ({ ...f, [k]: value }));
    setErrors((er) => ({ ...er, [k]: undefined }));
  };

  function validate() {
    const next: typeof errors = {};
    if (form.name.trim().length < 2) next.name = "Please enter your full name";
    if (!isGenuineIndianMobile(form.phone)) next.phone = "Please enter a valid 10-digit mobile number.";
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = "Please enter a valid email address";
    if (resume && resume.size > MAX_RESUME_BYTES) next.resume = "Résumé must be 5 MB or smaller";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setServerError("");
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = await careersApi.apply(
        job.slug,
        {
          name: form.name.trim(),
          phone: form.phone,
          ...(form.email.trim() ? { email: form.email.trim() } : {}),
          ...(form.city.trim() ? { city: form.city.trim() } : {}),
          ...(form.experience.trim() ? { experience: form.experience.trim() } : {}),
          ...(form.message.trim() ? { message: form.message.trim() } : {}),
        },
        resume,
      );
      setDone(res.message);
      setForm(emptyForm);
      setResume(null);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Couldn't send your application — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  const facts = [
    { icon: MapPin, label: "Location", value: job.location },
    { icon: Briefcase, label: "Job type", value: EMPLOYMENT_TYPE_LABEL[job.employmentType] },
    job.experience ? { icon: GraduationCap, label: "Experience", value: job.experience } : null,
    job.salary ? { icon: IndianRupee, label: "Salary", value: job.salary } : null,
    { icon: Users, label: "Openings", value: String(job.openings) },
    { icon: Building2, label: "Hiring", value: job.postedBy },
  ].filter((f): f is NonNullable<typeof f> => f !== null);

  return (
    <section className="py-10 lg:py-14">
      <div className="container-page">
        <nav className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Link to="/" className="hover:text-primary">
            Home
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link to="/careers" className="hover:text-primary">
            Careers
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-primary">{job.title}</span>
        </nav>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_400px]">
          <div className="min-w-0">
            {job.department ? <p className="text-xs font-bold tracking-wide text-primary uppercase">{job.department}</p> : null}
            <h1 className="mt-1 text-3xl font-extrabold">{job.title}</h1>
            <a
              href="#apply"
              className="mt-4 inline-flex h-11 items-center rounded-full bg-secondary px-6 text-sm font-bold text-secondary-foreground shadow-[var(--shadow-cta)] lg:hidden"
            >
              Apply now
            </a>

            <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {facts.map((f) => (
                <div key={f.label} className="rounded-xl border border-border bg-card p-3.5">
                  <dt className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                    <f.icon className="h-3.5 w-3.5" /> {f.label}
                  </dt>
                  <dd className="mt-1 text-sm font-bold break-words">{f.value}</dd>
                </div>
              ))}
            </dl>

            <h2 className="mt-8 text-lg font-extrabold">About the role</h2>
            <div className="mt-3 space-y-4 text-sm leading-relaxed text-foreground/85">
              {paragraphs.map((p, i) => (
                <p key={i} className="whitespace-pre-line">
                  {p}
                </p>
              ))}
            </div>

            {requirements.length > 0 ? (
              <>
                <h2 className="mt-8 text-lg font-extrabold">What we're looking for</h2>
                <ul className="mt-3 space-y-2">
                  {requirements.map((r, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-foreground/85">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {r}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            <Link to="/careers" className="mt-10 inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline">
              <ArrowLeft className="h-4 w-4" /> All openings
            </Link>
          </div>

          <aside ref={applyRef} id="apply" className="lg:sticky lg:top-24 lg:self-start">
            <div className="surface-card p-6 shadow-[var(--shadow-lift)]">
              {done ? (
                <div className="py-6 text-center" role="status">
                  <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
                  <h2 className="mt-3 text-lg font-extrabold">Application sent</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{done}</p>
                  <Link to="/careers" className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline">
                    See other openings
                  </Link>
                </div>
              ) : (
                <form onSubmit={submit} noValidate>
                  <h2 className="text-lg font-extrabold">Apply for this role</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Fields marked * are required.</p>

                  <div className="mt-5 space-y-3.5">
                    <div>
                      <input
                        value={form.name}
                        onChange={set("name")}
                        placeholder="Full name *"
                        aria-label="Full name"
                        autoComplete="name"
                        className={cn(inputCls, errors.name ? "border-destructive" : "border-border")}
                      />
                      {errors.name ? <p className="mt-1.5 text-xs font-semibold text-destructive">{errors.name}</p> : null}
                    </div>
                    <div>
                      <div
                        className={cn(
                          "flex h-12 items-center gap-3 rounded-xl border bg-muted px-3.5",
                          errors.phone ? "border-destructive" : "border-border",
                        )}
                      >
                        <IndiaDialCode />
                        <input
                          value={form.phone}
                          onChange={set("phone")}
                          inputMode="numeric"
                          placeholder="Mobile number *"
                          aria-label="Mobile number"
                          autoComplete="tel-national"
                          className="h-full w-full min-w-0 bg-transparent text-sm leading-none focus:outline-none"
                        />
                      </div>
                      {errors.phone ? <p className="mt-1.5 text-xs font-semibold text-destructive">{errors.phone}</p> : null}
                    </div>
                    <div>
                      <input
                        type="email"
                        value={form.email}
                        onChange={set("email")}
                        placeholder="Email"
                        aria-label="Email"
                        autoComplete="email"
                        className={cn(inputCls, errors.email ? "border-destructive" : "border-border")}
                      />
                      {errors.email ? <p className="mt-1.5 text-xs font-semibold text-destructive">{errors.email}</p> : null}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <input value={form.city} onChange={set("city")} placeholder="Current city" aria-label="Current city" className={cn(inputCls, "border-border")} />
                      <input
                        value={form.experience}
                        onChange={set("experience")}
                        placeholder="Experience"
                        aria-label="Experience"
                        className={cn(inputCls, "border-border")}
                      />
                    </div>
                    <textarea
                      value={form.message}
                      onChange={set("message")}
                      rows={3}
                      maxLength={2000}
                      placeholder="Anything you'd like us to know (optional)"
                      aria-label="Message"
                      className="w-full rounded-xl border border-border bg-muted px-3.5 py-3 text-sm focus:border-primary/40 focus:outline-none"
                    />
                    <div>
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-2.5 rounded-xl border border-dashed px-3.5 py-3 text-sm font-semibold text-primary hover:bg-primary-soft",
                          errors.resume ? "border-destructive" : "border-border",
                        )}
                      >
                        <FileText className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 truncate">{resume ? resume.name : "Attach résumé (PDF or Word, max 5 MB)"}</span>
                        <input
                          type="file"
                          accept={RESUME_ACCEPT}
                          className="sr-only"
                          onChange={(e) => {
                            setResume(e.target.files?.[0] ?? null);
                            setErrors((er) => ({ ...er, resume: undefined }));
                          }}
                        />
                      </label>
                      {resume ? (
                        <button type="button" onClick={() => setResume(null)} className="mt-1.5 text-xs font-semibold text-muted-foreground hover:underline">
                          Remove file
                        </button>
                      ) : null}
                      {errors.resume ? <p className="mt-1.5 text-xs font-semibold text-destructive">{errors.resume}</p> : null}
                    </div>
                  </div>

                  {serverError ? <p className="mt-3 text-xs font-semibold text-destructive">{serverError}</p> : null}
                  <ActionButton type="submit" variant="primary" size="md" className="mt-5 w-full" disabled={submitting}>
                    {submitting ? "Sending…" : "Submit application"}
                  </ActionButton>
                  <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                    Your details are shared only with the hiring team for this role.
                  </p>
                </form>
              )}
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
