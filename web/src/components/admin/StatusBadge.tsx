import { cn } from "@/lib/utils";

const tints: Record<string, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-destructive/10 text-destructive",
  primary: "bg-primary-soft text-primary",
  secondary: "bg-secondary-soft text-secondary",
  neutral: "bg-muted text-muted-foreground",
};

export function StatusBadge({ tone, children }: { tone: keyof typeof tints; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap", tints[tone])}>
      {children}
    </span>
  );
}
