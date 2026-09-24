import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Star, X } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPagination, usePagedList } from "@/components/admin/AdminPagination";
import { TableEmptyState, TableLoadingState, TableShell, Td, Th } from "@/components/admin/AdminTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { AdminApiError, adminReviewsApi, type AdminReview } from "@/lib/admin-api";

export const Route = createFileRoute("/admin/reviews")({
  head: () => ({ meta: [{ title: "Reviews — MD Path Lab Admin" }, { name: "robots", content: "noindex" }] }),
  component: AdminReviewsPage,
});

const PAGE_SIZE = 15;

const TABS = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
] as const;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function AdminReviewsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("PENDING");
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    adminReviewsApi
      .list(tab)
      .then(setReviews)
      .catch((err) => setListError(err instanceof AdminApiError ? err.message : "Couldn't load reviews"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function handleSetStatus(id: string, status: "APPROVED" | "REJECTED") {
    setActingId(id);
    try {
      await adminReviewsApi.setStatus(id, status);
      load();
    } catch (err) {
      setListError(err instanceof AdminApiError ? err.message : "Couldn't update this review");
    } finally {
      setActingId(null);
    }
  }

  const { page, setPage, pageCount, paged, total } = usePagedList(reviews, PAGE_SIZE);

  return (
    <AdminLayout activePath="/admin/reviews">
      <AdminPageHeader
        title="Reviews"
        description="Approve a rating to show it in the homepage reviews section and count it toward the public average."
      />

      <div className="mt-5 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={
              tab === t.value
                ? "rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground"
                : "rounded-full border border-border px-4 py-1.5 text-xs font-bold text-muted-foreground hover:border-primary/40 hover:text-primary"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {listError ? <p className="mt-3 text-sm font-semibold text-destructive">{listError}</p> : null}

      <div className="mt-6">
        <TableShell>
          <thead>
            <tr>
              <Th>Patient</Th>
              <Th>Booking</Th>
              <Th>Rating</Th>
              <Th>Comment</Th>
              <Th>Submitted</Th>
              {tab === "PENDING" ? <Th align="right">Actions</Th> : <Th>Status</Th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoadingState colSpan={6} />
            ) : paged.length === 0 ? (
              <TableEmptyState icon={Star} message="No reviews here yet." colSpan={6} />
            ) : (
              paged.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-muted/40">
                  <Td className="whitespace-nowrap">
                    <p className="font-semibold">{r.user.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{r.user.phone}</p>
                  </Td>
                  <Td className="whitespace-nowrap font-semibold">{r.order.orderNumber}</Td>
                  <Td className="whitespace-nowrap">
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={i < r.rating ? "h-3.5 w-3.5 fill-warning text-warning" : "h-3.5 w-3.5 text-border"} />
                      ))}
                    </div>
                  </Td>
                  <Td className="max-w-xs text-muted-foreground">{r.comment ?? "—"}</Td>
                  <Td className="whitespace-nowrap text-muted-foreground">{formatDate(r.createdAt)}</Td>
                  {tab === "PENDING" ? (
                    <Td align="right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleSetStatus(r.id, "APPROVED")}
                          disabled={actingId === r.id}
                          className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold text-foreground/80 hover:border-success/40 hover:text-success disabled:opacity-60"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleSetStatus(r.id, "REJECTED")}
                          disabled={actingId === r.id}
                          className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold text-foreground/80 hover:border-destructive/40 hover:text-destructive disabled:opacity-60"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </Td>
                  ) : (
                    <Td>
                      <StatusBadge tone={r.status === "APPROVED" ? "success" : "danger"}>
                        {r.status === "APPROVED" ? "Approved" : "Rejected"}
                      </StatusBadge>
                    </Td>
                  )}
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
