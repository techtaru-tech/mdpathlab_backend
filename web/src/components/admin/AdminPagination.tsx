import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Slices `items` into pages of `pageSize`, resetting to page 1 whenever `resetKey` changes
 *  (pass a value derived from your search/filter state) so a new filter never leaves the view
 *  stranded on an out-of-range page. */
export function usePagedList<T>(items: T[], pageSize: number, resetKey?: unknown) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const paged = items.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return { page: currentPage, setPage, pageCount, paged, total: items.length };
}

export function AdminPagination({
  page,
  pageCount,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  if (total === 0) return null;

  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs font-semibold text-muted-foreground">
        Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
      </p>
      {pageCount > 1 ? (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={page === 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            className="grid h-9 w-9 place-items-center rounded-lg border border-border text-foreground disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {Array.from({ length: pageCount }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === pageCount || Math.abs(p - page) <= 1)
            .map((p, i, arr) => (
              <div key={p} className="flex items-center gap-1.5">
                {i > 0 && arr[i - 1] !== p - 1 ? <span className="px-1 text-xs text-muted-foreground">…</span> : null}
                <button
                  type="button"
                  onClick={() => onPageChange(p)}
                  className={
                    p === page
                      ? "grid h-9 w-9 place-items-center rounded-lg bg-foreground text-sm font-bold text-background"
                      : "grid h-9 w-9 place-items-center rounded-lg border border-border text-sm font-semibold hover:bg-muted"
                  }
                >
                  {p}
                </button>
              </div>
            ))}
          <button
            type="button"
            disabled={page === pageCount}
            onClick={() => onPageChange(Math.min(pageCount, page + 1))}
            className="grid h-9 w-9 place-items-center rounded-lg border border-border text-foreground disabled:opacity-40"
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
