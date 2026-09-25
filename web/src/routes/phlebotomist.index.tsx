import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Calendar, Clock, LogOut, MapPin } from "lucide-react";
import { ApiError } from "@/lib/api";
import { phlebotomistOrdersApi, phlebotomistSession, type PhlebotomistAssignment } from "@/lib/phlebotomist-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/phlebotomist/")({
  head: () => ({ meta: [{ title: "Today's Assignments — Phlebotomist" }, { name: "robots", content: "noindex" }] }),
  component: PhlebotomistDashboardPage,
});

function formatDate(iso: string | null) {
  if (!iso) return "Today";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function subStatusLabel(a: PhlebotomistAssignment): { label: string; tone: string } {
  if (a.assignmentStatus === "PENDING") return { label: "Awaiting your response", tone: "bg-warning/15 text-warning" };
  if (a.handedOverAt) return { label: "Handed over to lab", tone: "bg-success-soft text-success" };
  if (a.phlebotomistStatus === "Collected") return { label: "Sample collected", tone: "bg-success-soft text-success" };
  if (a.collectionOtpVerifiedAt) return { label: "Verified — ready to collect", tone: "bg-primary-soft text-primary" };
  if (a.reachedAt) return { label: "Arrived", tone: "bg-primary-soft text-primary" };
  if (a.onTheWayAt) return { label: "On the way", tone: "bg-primary-soft text-primary" };
  return { label: "Accepted — not started", tone: "bg-muted text-foreground" };
}

function PhlebotomistDashboardPage() {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<PhlebotomistAssignment[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!phlebotomistSession.getToken()) {
      navigate({ to: "/phlebotomist/login" });
      return;
    }
    phlebotomistOrdersApi
      .listToday()
      .then(setAssignments)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load today's assignments"));
  }, [navigate]);

  const profile = phlebotomistSession.getProfile();

  function handleLogout() {
    phlebotomistSession.clear();
    navigate({ to: "/phlebotomist/login" });
  }

  return (
    <section className="min-h-screen bg-muted/40 py-6">
      <div className="container-page mx-auto max-w-lg">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold">Today's Assignments</h1>
            <p className="text-xs text-muted-foreground">{profile?.name ?? profile?.employeeCode}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-destructive"
          >
            <LogOut className="h-3.5 w-3.5" /> Log out
          </button>
        </div>

        {error ? <p className="mt-6 rounded-xl bg-destructive/10 p-4 text-sm font-semibold text-destructive">{error}</p> : null}

        <div className="mt-5 space-y-3">
          {assignments === null ? (
            [0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />)
          ) : assignments.length === 0 ? (
            <div className="surface-card p-8 text-center text-sm text-muted-foreground">No assignments scheduled for today.</div>
          ) : (
            assignments.map((a) => {
              const sub = subStatusLabel(a);
              return (
                <Link key={a.id} to="/phlebotomist/orders/$id" params={{ id: a.id }} className="surface-card block p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold">{a.patientName ?? "Patient"}</p>
                      <p className="text-xs text-muted-foreground">{a.orderNumber}</p>
                    </div>
                    <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold", sub.tone)}>{sub.label}</span>
                  </div>
                  <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                    <p className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
                      {a.address ? `${a.address.line1}, ${a.address.city} ${a.address.pincode}` : "No address"}
                    </p>
                    <p className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 shrink-0 text-primary" /> {formatDate(a.scheduledDate)}
                      <Clock className="ml-2 h-3.5 w-3.5 shrink-0 text-primary" /> {a.slot?.label ?? "—"}
                    </p>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
