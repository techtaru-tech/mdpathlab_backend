import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Briefcase, Clock, GraduationCap, HeartPulse, MapPin, Search, ShieldCheck, Users } from "lucide-react";
import { PageHero } from "@/components/ui-kit/PageHero";
import { careersApi, EMPLOYMENT_TYPE_LABEL } from "@/lib/api";
import { useSiteSettings } from "@/lib/site-settings";

const title = "Careers — MD Path Lab";
const description =
  "Join MD Path Lab and our partner labs. Open roles for phlebotomists, lab technicians, pathologists, customer support and more.";

export const Route = createFileRoute("/careers/")({
  loader: () => careersApi.list().catch(() => []),
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
    ],
  }),
  component: CareersPage,
});

const perks = [
  { icon: HeartPulse, title: "Meaningful work", text: "Every sample you handle helps a patient get the right diagnosis, on time." },
  { icon: GraduationCap, title: "Training & growth", text: "Hands-on training on NABL-grade processes and a clear path to grow." },
  { icon: ShieldCheck, title: "Safe workplace", text: "Proper protective equipment, biosafety protocols and insurance cover." },
  { icon: Users, title: "Supportive team", text: "Work alongside experienced pathologists, technicians and field staff." },
];

function postedAgo(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Posted today";
  if (days === 1) return "Posted yesterday";
  if (days < 30) return `Posted ${days} days ago`;
  return `Posted ${new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
}

function CareersPage() {
  const jobs = Route.useLoaderData();
  const settings = useSiteSettings();
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");

  const locations = useMemo(() => [...new Set(jobs.map((j) => j.location))].sort(), [jobs]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter(
      (j) =>
        (!location || j.location === location) &&
        (!q || [j.title, j.department, j.postedBy, j.location].filter(Boolean).join(" ").toLowerCase().includes(q)),
    );
  }, [jobs, query, location]);

  return (
    <>
      <PageHero
        crumb="Careers"
        eyebrow="Careers"
        title="Build a healthier India with us"
        description="Open roles at MD Path Lab and our partner labs — from home sample collection to the lab bench."
      />

      <section className="py-12 lg:py-16">
        <div className="container-page">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {perks.map((p) => (
              <div key={p.title} className="surface-card p-5">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
                  <p.icon className="h-5 w-5" />
                </span>
                <h2 className="mt-3 text-sm font-extrabold">{p.title}</h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{p.text}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-extrabold">Open positions</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {jobs.length === 0 ? "No openings right now" : `${jobs.length} open role${jobs.length === 1 ? "" : "s"}`}
              </p>
            </div>
            {jobs.length > 0 ? (
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <label className="flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-3.5 sm:w-64">
                  <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search roles"
                    aria-label="Search roles"
                    className="w-full min-w-0 bg-transparent text-sm focus:outline-none"
                  />
                </label>
                {locations.length > 1 ? (
                  <select
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    aria-label="Location"
                    className="h-11 rounded-xl border border-border bg-card px-3 text-sm font-semibold focus:outline-none"
                  >
                    <option value="">All locations</option>
                    {locations.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="mt-6 space-y-3">
            {jobs.length === 0 ? (
              <div className="surface-card p-8 text-center">
                <Briefcase className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 text-sm font-bold">We don't have any open roles at the moment.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  You can still send your CV to{" "}
                  {settings?.email ? (
                    <a href={`mailto:${settings.email}?subject=Job%20application`} className="font-bold text-primary hover:underline">
                      {settings.email}
                    </a>
                  ) : (
                    "our team"
                  )}{" "}
                  — we'll reach out when something fits.
                </p>
              </div>
            ) : shown.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No roles match your search.</p>
            ) : (
              shown.map((job) => (
                <Link
                  key={job.id}
                  to="/careers/$slug"
                  params={{ slug: job.slug }}
                  className="surface-card group flex flex-col gap-3 p-5 transition-shadow hover:shadow-[var(--shadow-lift)] sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold tracking-wide text-primary uppercase">{job.department ?? job.postedBy}</p>
                    <h3 className="mt-1 text-lg font-extrabold group-hover:text-primary">{job.title}</h3>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" /> {job.location}
                      </span>
                      <span className="flex items-center gap-1">
                        <Briefcase className="h-3.5 w-3.5" /> {EMPLOYMENT_TYPE_LABEL[job.employmentType]}
                      </span>
                      {job.experience ? (
                        <span className="flex items-center gap-1">
                          <GraduationCap className="h-3.5 w-3.5" /> {job.experience}
                        </span>
                      ) : null}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" /> {postedAgo(job.createdAt)}
                      </span>
                    </div>
                    {job.department ? <p className="mt-1.5 text-xs text-muted-foreground">Hiring: {job.postedBy}</p> : null}
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-bold text-primary">
                    View & apply <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>
      </section>
    </>
  );
}
