import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

/** Shown on the Terms / Privacy pages when they were opened from the login page, to go straight back to it. */
export function BackToLogin({ redirect, className }: { redirect?: string | undefined; className?: string }) {
  return (
    <Link
      to="/login"
      search={{ redirect }}
      className={
        "inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-primary hover:bg-primary-soft " +
        (className ?? "")
      }
    >
      <ArrowLeft className="h-4 w-4" /> Back to Login
    </Link>
  );
}
