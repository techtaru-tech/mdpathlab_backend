import { useEffect, useMemo, useState } from "react";
import { Briefcase, ExternalLink, FileText, Mail, Pencil, Plus, Trash2, Users } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { TableEmptyState, TableLoadingState, TableShell, Td, Th } from "@/components/admin/AdminTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import {
  apiFileUrl,
  EMPLOYMENT_TYPE_LABEL,
  type CareersManagerApi,
  type EmploymentType,
  type JobApplication,
  type JobApplicationStatus,
  type JobOpeningInput,
  type ManagedJobOpening,
} from "@/lib/api";
import { cn } from "@/lib/utils";

// One screen for both the admin (every opening, MD Path Labs' own and each lab's) and a partner lab (only its
// own openings). The API object decides which; this component never needs to know.

const emptyForm = {
  title: "",
  department: "",
  location: "",
  employmentType: "FULL_TIME" as EmploymentType,
  experience: "",
  salary: "",
  openings: "1",
  description: "",
  requirements: "",
  status: "OPEN" as "OPEN" | "CLOSED",
};
type FormValues = typeof emptyForm;

const APPLICATION_STATUS: Record<JobApplicationStatus, { label: string; tone: "warning" | "primary" | "danger" | "success" }> = {
  NEW: { label: "New", tone: "warning" },
  SHORTLISTED: { label: "Shortlisted", tone: "primary" },
  REJECTED: { label: "Rejected", tone: "danger" },
  HIRED: { label: "Hired", tone: "success" },
};

const inputCls = "h-11 w-full rounded-lg border border-border bg-muted px-3 text-sm focus:border-primary/40 focus:outline-none";
const areaCls = "w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm focus:border-primary/40 focus:outline-none";

function toForm(job: ManagedJobOpening): FormValues {
  return {
    title: job.title,
    department: job.department ?? "",
    location: job.location,
    employmentType: job.employmentType,
    experience: job.experience ?? "",
    salary: job.salary ?? "",
    openings: String(job.openings),
    description: job.description,
    requirements: job.requirements ?? "",
    status: job.status,
  };
}

function toInput(v: FormValues): JobOpeningInput {
  return {
    title: v.title.trim(),
    department: v.department.trim(),
    location: v.location.trim(),
    employmentType: v.employmentType,
    experience: v.experience.trim(),
    salary: v.salary.trim(),
    openings: Math.max(1, Number(v.openings) || 1),
    description: v.description.trim(),
    requirements: v.requirements.trim(),
    status: v.status,
  };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={cn("block", wide && "sm:col-span-2")}>
      <span className="mb-1.5 block text-xs font-bold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function JobForm({
  initial,
  saving,
  error,
  onSave,
  onCancel,
}: {
  initial: FormValues;
  saving: boolean;
  error: string;
  onSave: (v: FormValues) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial);
  const set = (k: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const ready = form.title.trim().length >= 2 && form.location.trim().length >= 2 && form.description.trim().length >= 10;

  return (
    <div className="mt-4 grid gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:grid-cols-2">
      <Field label="Job title *">
        <input value={form.title} onChange={set("title")} placeholder="e.g. Phlebotomist" className={inputCls} />
      </Field>
      <Field label="Department">
        <input value={form.department} onChange={set("department")} placeholder="e.g. Home Collection" className={inputCls} />
      </Field>
      <Field label="Location *">
        <input value={form.location} onChange={set("location")} placeholder="e.g. Kanpur" className={inputCls} />
      </Field>
      <Field label="Employment type">
        <select value={form.employmentType} onChange={set("employmentType")} className={inputCls}>
          {Object.entries(EMPLOYMENT_TYPE_LABEL).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Experience">
        <input value={form.experience} onChange={set("experience")} placeholder="e.g. 1–3 years / Freshers welcome" className={inputCls} />
      </Field>
      <Field label="Salary">
        <input value={form.salary} onChange={set("salary")} placeholder="e.g. ₹15,000–20,000 / month (optional)" className={inputCls} />
      </Field>
      <Field label="Number of openings">
        <input type="number" min={1} value={form.openings} onChange={set("openings")} className={inputCls} />
      </Field>
      <Field label="Status">
        <select value={form.status} onChange={set("status")} className={inputCls}>
          <option value="OPEN">Open — shown on the Careers page</option>
          <option value="CLOSED">Closed — hidden from the website</option>
        </select>
      </Field>
      <Field label="Job description * (blank line = new paragraph)" wide>
        <textarea value={form.description} onChange={set("description")} rows={5} placeholder="What the role involves, day to day" className={areaCls} />
      </Field>
      <Field label="Requirements (one per line)" wide>
        <textarea
          value={form.requirements}
          onChange={set("requirements")}
          rows={4}
          placeholder={"DMLT / BMLT\nOwn two-wheeler with licence"}
          className={areaCls}
        />
      </Field>
      {error ? <p className="text-xs font-semibold text-destructive sm:col-span-2">{error}</p> : null}
      <div className="flex gap-2 sm:col-span-2">
        <ActionButton type="button" variant="primary" size="sm" disabled={saving || !ready} onClick={() => onSave(form)}>
          {saving ? "Saving…" : "Save opening"}
        </ActionButton>
        <ActionButton type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </ActionButton>
      </div>
    </div>
  );
}

export function CareersManager({ api, showPostedBy }: { api: CareersManagerApi; showPostedBy: boolean }) {
  const [tab, setTab] = useState<"jobs" | "applications">("jobs");
  const [jobs, setJobs] = useState<ManagedJobOpening[]>([]);
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<"new" | string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [jobFilter, setJobFilter] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    Promise.all([api.listJobs(), api.listApplications()])
      .then(([j, a]) => {
        setJobs(j);
        setApplications(a);
      })
      .finally(() => setLoading(false));
  }, [api]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  async function save(values: FormValues) {
    setSaving(true);
    setFormError("");
    try {
      if (editing === "new") {
        const created = await api.createJob(toInput(values));
        setJobs((prev) => [created, ...prev]);
        setNotice(created.status === "OPEN" ? `"${created.title}" is now live on the Careers page.` : `"${created.title}" saved as closed.`);
      } else if (editing) {
        const updated = await api.updateJob(editing, toInput(values));
        setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
        setNotice(`"${updated.title}" updated.`);
      }
      setEditing(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't save this opening");
    } finally {
      setSaving(false);
    }
  }

  async function toggleOpen(job: ManagedJobOpening) {
    setBusyId(job.id);
    try {
      const updated = await api.updateJob(job.id, { status: job.status === "OPEN" ? "CLOSED" : "OPEN" });
      setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
      setNotice(updated.status === "OPEN" ? `"${updated.title}" reopened.` : `"${updated.title}" closed — hidden from the website.`);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(job: ManagedJobOpening) {
    const n = job._count.applications;
    if (!window.confirm(`Delete "${job.title}"?${n ? ` Its ${n} application${n === 1 ? "" : "s"} will be deleted too.` : ""}`)) return;
    setBusyId(job.id);
    try {
      await api.deleteJob(job.id);
      setJobs((prev) => prev.filter((j) => j.id !== job.id));
      setApplications((prev) => prev.filter((a) => a.job.id !== job.id));
      setNotice(`"${job.title}" deleted.`);
    } finally {
      setBusyId(null);
    }
  }

  async function setStatus(app: JobApplication, status: JobApplicationStatus) {
    setBusyId(app.id);
    try {
      const updated = await api.setApplicationStatus(app.id, status);
      setApplications((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } finally {
      setBusyId(null);
    }
  }

  const shownApplications = useMemo(
    () => (jobFilter ? applications.filter((a) => a.job.id === jobFilter) : applications),
    [applications, jobFilter],
  );
  const openCount = jobs.filter((j) => j.status === "OPEN").length;
  const newCount = applications.filter((a) => a.status === "NEW").length;

  return (
    <>
      <AdminPageHeader
        title="Careers"
        description={`${openCount} open role${openCount === 1 ? "" : "s"} · ${applications.length} application${applications.length === 1 ? "" : "s"} (${newCount} new)`}
        actions={
          tab === "jobs" && editing === null ? (
            <ActionButton
              variant="primary"
              size="sm"
              onClick={() => {
                setFormError("");
                setEditing("new");
              }}
            >
              <Plus className="h-4 w-4" /> Post a job
            </ActionButton>
          ) : null
        }
      />

      <div className="mt-5 flex gap-1.5 rounded-xl bg-muted p-1 sm:inline-flex">
        {(
          [
            ["jobs", `Openings (${jobs.length})`],
            ["applications", `Applications (${applications.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "flex-1 rounded-lg px-4 py-2 text-sm font-bold transition-colors sm:flex-none",
              tab === key ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {notice ? (
        <p role="status" className="mt-4 rounded-xl border border-success/30 bg-success/10 px-4 py-2.5 text-sm font-semibold text-success">
          {notice}
        </p>
      ) : null}

      {tab === "jobs" ? (
        <>
          {editing === "new" ? <JobForm initial={emptyForm} saving={saving} error={formError} onSave={save} onCancel={() => setEditing(null)} /> : null}

          <div className="mt-5 space-y-3">
            {loading ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
            ) : jobs.length === 0 && editing !== "new" ? (
              <div className="rounded-2xl border border-dashed border-border p-10 text-center">
                <Briefcase className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 text-sm font-semibold">No openings yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Post a job and it appears on the website's Careers page straight away.</p>
              </div>
            ) : (
              jobs.map((job) =>
                editing === job.id ? (
                  <JobForm key={job.id} initial={toForm(job)} saving={saving} error={formError} onSave={save} onCancel={() => setEditing(null)} />
                ) : (
                  <div key={job.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-extrabold">{job.title}</h3>
                          <StatusBadge tone={job.status === "OPEN" ? "success" : "neutral"}>{job.status === "OPEN" ? "Open" : "Closed"}</StatusBadge>
                        </div>
                        <p className="mt-1 text-xs font-semibold text-muted-foreground">
                          {[job.department, job.location, EMPLOYMENT_TYPE_LABEL[job.employmentType], job.experience, `${job.openings} opening${job.openings === 1 ? "" : "s"}`]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        {showPostedBy ? (
                          <p className="mt-1 text-xs font-bold text-primary">Posted by {job.lab?.name ?? "MD Path Labs"}</p>
                        ) : null}
                        <p className="mt-1 text-xs text-muted-foreground">Posted {formatDate(job.createdAt)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setJobFilter(job.id);
                          setTab("applications");
                        }}
                        className="flex items-center gap-1.5 rounded-xl bg-primary-soft px-3 py-2 text-xs font-bold text-primary hover:bg-primary/15"
                      >
                        <Users className="h-3.5 w-3.5" /> {job._count.applications} application{job._count.applications === 1 ? "" : "s"}
                      </button>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <ActionButton
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setFormError("");
                          setEditing(job.id);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </ActionButton>
                      <ActionButton variant="outline" size="sm" disabled={busyId === job.id} onClick={() => toggleOpen(job)}>
                        {job.status === "OPEN" ? "Close" : "Reopen"}
                      </ActionButton>
                      {job.status === "OPEN" ? (
                        <a
                          href={`/careers/${job.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-primary hover:bg-primary-soft"
                        >
                          <ExternalLink className="h-3.5 w-3.5" /> View on website
                        </a>
                      ) : null}
                      <button
                        type="button"
                        disabled={busyId === job.id}
                        onClick={() => remove(job)}
                        className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-60"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </div>
                  </div>
                ),
              )
            )}
          </div>
        </>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <select value={jobFilter} onChange={(e) => setJobFilter(e.target.value)} className={cn(inputCls, "w-auto min-w-[240px] bg-card")}>
              <option value="">All openings</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title} — {j.location}
                  {showPostedBy ? ` (${j.lab?.name ?? "MD Path Labs"})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-4">
            <TableShell>
              <thead>
                <tr>
                  <Th>Applied</Th>
                  <Th>Applicant</Th>
                  <Th>Role</Th>
                  <Th>Experience / City</Th>
                  <Th>Message</Th>
                  <Th>Résumé</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <TableLoadingState colSpan={7} />
                ) : shownApplications.length === 0 ? (
                  <TableEmptyState icon={Users} message="No applications yet." colSpan={7} />
                ) : (
                  shownApplications.map((a) => (
                    <tr key={a.id} className="align-top transition-colors hover:bg-muted/40">
                      <Td className="whitespace-nowrap text-muted-foreground">{formatDate(a.createdAt)}</Td>
                      <Td className="whitespace-nowrap">
                        <p className="font-semibold">{a.name}</p>
                        <a href={`tel:+91${a.phone}`} className="text-xs text-primary hover:underline">
                          +91 {a.phone}
                        </a>
                        {a.email ? (
                          <a href={`mailto:${a.email}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:underline">
                            <Mail className="h-3 w-3 shrink-0" /> {a.email}
                          </a>
                        ) : null}
                      </Td>
                      <Td className="whitespace-nowrap">
                        <p className="font-semibold">{a.job.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {a.job.location}
                          {showPostedBy ? ` · ${a.job.lab?.name ?? "MD Path Labs"}` : ""}
                        </p>
                      </Td>
                      <Td className="text-sm">
                        <p>{a.experience ?? "—"}</p>
                        {a.city ? <p className="text-xs text-muted-foreground">{a.city}</p> : null}
                      </Td>
                      <Td className="max-w-xs">
                        <p className="line-clamp-3 text-sm text-foreground/85">{a.message ?? "—"}</p>
                      </Td>
                      <Td>
                        {a.resumeUrl ? (
                          <a
                            href={apiFileUrl(a.resumeUrl)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline"
                          >
                            <FileText className="h-4 w-4" /> View
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </Td>
                      <Td>
                        <select
                          value={a.status}
                          disabled={busyId === a.id}
                          onChange={(e) => setStatus(a, e.target.value as JobApplicationStatus)}
                          aria-label={`Status for ${a.name}`}
                          className="h-9 rounded-lg border border-border bg-card px-2 text-xs font-bold focus:outline-none"
                        >
                          {Object.entries(APPLICATION_STATUS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v.label}
                            </option>
                          ))}
                        </select>
                        <div className="mt-1.5">
                          <StatusBadge tone={APPLICATION_STATUS[a.status].tone}>{APPLICATION_STATUS[a.status].label}</StatusBadge>
                        </div>
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </TableShell>
          </div>
        </>
      )}
    </>
  );
}
