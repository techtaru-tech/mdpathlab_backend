import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPagination, usePagedList } from "@/components/admin/AdminPagination";
import { TableEmptyState, TableLoadingState, TableShell, Td, Th } from "@/components/admin/AdminTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { AdminApiError, adminEmailLogsApi, type AdminEmailLog } from "@/lib/admin-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/email-logs")({
  head: () => ({ meta: [{ title: "Email Logs — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminEmailLogsPage,
});

const PAGE_SIZE = 15;
const FILTERS = ["", "SENT", "FAILED", "SKIPPED"] as const;

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function AdminEmailLogsPage() {
  const [rows, setRows] = useState<AdminEmailLog[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [configured, setConfigured] = useState(true);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  function load() {
    setLoading(true);
    adminEmailLogsApi
      .list(status)
      .then((res) => {
        setRows(res.rows);
        setCounts(res.counts);
        setConfigured(res.configured);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, [status]);
  const { page, setPage, pageCount, paged, total } = usePagedList(rows, PAGE_SIZE, status);

  async function sendTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await adminEmailLogsApi.sendTest(testTo.trim());
      setTestResult(
        res.status === "SENT"
          ? { ok: true, text: "Test email sent — check the inbox (and spam folder)." }
          : { ok: false, text: res.status === "SKIPPED" ? "Email is not configured on the server yet (SMTP password missing)." : `Sending failed: ${res.error ?? "unknown error"}` },
      );
      load();
    } catch (err) {
      setTestResult({ ok: false, text: err instanceof AdminApiError ? err.message : "Couldn't send the test email" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <AdminLayout activePath="/admin/email-logs">
      <AdminPageHeader
        title="Email Logs"
        description={`${counts["SENT"] ?? 0} sent · ${counts["FAILED"] ?? 0} failed · ${counts["SKIPPED"] ?? 0} skipped. Every booking, report and home-visit email, with the reason when one didn't go out.`}
      />

      {!configured ? (
        <p className="mt-4 rounded-xl bg-warning/15 p-4 text-sm font-semibold text-warning">
          Email is not configured on the server yet, so emails are only being logged as “skipped”. Set the SMTP password in the server settings to turn it on.
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <input
          type="email"
          value={testTo}
          onChange={(e) => setTestTo(e.target.value)}
          placeholder="Send a test email to…"
          className="h-10 w-64 rounded-lg border border-border bg-muted px-3 text-sm focus:outline-none"
        />
        <button
          type="button"
          disabled={testing || !/^\S+@\S+\.\S+$/.test(testTo.trim())}
          onClick={sendTest}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
        >
          {testing ? "Sending…" : "Send test email"}
        </button>
        {testResult ? <p className={cn("text-xs font-semibold", testResult.ok ? "text-success" : "text-destructive")}>{testResult.text}</p> : null}
      </div>

      <div className="mt-4 flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f || "all"}
            type="button"
            onClick={() => setStatus(f)}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-bold transition-colors",
              status === f ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/70 hover:text-primary",
            )}
          >
            {f === "" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <TableShell>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>To</Th>
              <Th>Email</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoadingState colSpan={4} />
            ) : paged.length === 0 ? (
              <TableEmptyState icon={Mail} message="No emails yet." colSpan={4} />
            ) : (
              paged.map((r) => (
                <tr key={r.id} className="align-top transition-colors hover:bg-muted/40">
                  <Td className="whitespace-nowrap text-muted-foreground">{formatDateTime(r.createdAt)}</Td>
                  <Td className="whitespace-nowrap">{r.toEmail}</Td>
                  <Td>
                    <p className="font-semibold">{r.subject}</p>
                    <p className="text-[11px] text-muted-foreground">{r.template}</p>
                  </Td>
                  <Td>
                    <StatusBadge tone={r.status === "SENT" ? "success" : r.status === "FAILED" ? "danger" : "warning"}>
                      {r.status === "SENT" ? "Sent" : r.status === "FAILED" ? "Failed" : "Skipped"}
                    </StatusBadge>
                    {r.error ? <p className="mt-1 max-w-xs text-[11px] text-muted-foreground">{r.error}</p> : null}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </TableShell>
      </div>

      {!loading ? <AdminPagination page={page} pageCount={pageCount} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} /> : null}
    </AdminLayout>
  );
}
