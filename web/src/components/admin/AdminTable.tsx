import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">{children}</table>
      </div>
    </div>
  );
}

export function Th({
  children,
  align = "left",
  sortKey,
  activeSort,
  onSort,
  className,
}: {
  children?: ReactNode;
  align?: "left" | "right";
  sortKey?: string;
  activeSort?: { key: string; dir: "asc" | "desc" };
  onSort?: (key: string) => void;
  className?: string;
}) {
  const isActive = sortKey && activeSort?.key === sortKey;
  const Icon: LucideIcon = isActive ? (activeSort!.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <th
      className={cn(
        "border-b border-border bg-muted/60 px-5 py-3 text-[11px] font-bold tracking-wide text-muted-foreground uppercase",
        align === "right" && "text-right",
        className,
      )}
    >
      {sortKey && onSort ? (
        <button
          type="button"
          onClick={() => onSort(sortKey)}
          className={cn(
            "flex items-center gap-1.5 hover:text-foreground",
            align === "right" && "ml-auto flex-row-reverse",
            isActive && "text-foreground",
          )}
        >
          {children}
          <Icon className="h-3 w-3 shrink-0" />
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export function Td({ children, align = "left", className }: { children: ReactNode; align?: "left" | "right"; className?: string }) {
  return (
    <td className={cn("border-b border-border px-5 py-3.5 align-middle", align === "right" && "text-right tabular-nums", className)}>
      {children}
    </td>
  );
}

export function TableEmptyState({ icon: Icon, message, colSpan }: { icon: LucideIcon; message: string; colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-14 text-center">
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-muted text-muted-foreground">
          <Icon className="h-5 w-5" />
        </span>
        <p className="mt-3 text-sm font-semibold text-muted-foreground">{message}</p>
      </td>
    </tr>
  );
}

export function TableLoadingState({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-14">
        <div className="mx-auto flex max-w-xs flex-col gap-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-3.5 animate-pulse rounded-full bg-muted" style={{ opacity: 1 - i * 0.25 }} />
          ))}
        </div>
      </td>
    </tr>
  );
}

export function Avatar({ label }: { label: string }) {
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-soft text-[11px] font-bold text-primary">
      {label.slice(0, 2).toUpperCase()}
    </span>
  );
}
