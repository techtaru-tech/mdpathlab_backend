import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Lock, Mail } from "lucide-react";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { AdminApiError, adminAuthApi, adminSession } from "@/lib/admin-api";

export const Route = createFileRoute("/admin/login")({
  head: () => ({ meta: [{ title: "Admin Login — MD Path Lab" }, { name: "robots", content: "noindex" }] }),
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await adminAuthApi.login(email, password);
      adminSession.save(res.accessToken, res.admin);
      navigate({ to: "/admin" });
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Couldn't log in — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-lg">
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="MD Path Lab" className="h-10 w-10 rounded-full object-contain" />
          <div>
            <p className="text-sm font-extrabold text-primary">MD Path Lab</p>
            <p className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">Admin Panel</p>
          </div>
        </div>

        <h1 className="mt-6 text-xl font-extrabold">Sign in</h1>

        <label className="mt-5 block">
          <span className="mb-1.5 block text-xs font-bold text-muted-foreground uppercase">Email</span>
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-muted px-3.5">
            <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              required
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@mdpathlabs.com"
              className="h-11 w-full min-w-0 bg-transparent text-sm font-medium focus:outline-none"
            />
          </div>
        </label>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-xs font-bold text-muted-foreground uppercase">Password</span>
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-muted px-3.5">
            <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-11 w-full min-w-0 bg-transparent text-sm font-medium focus:outline-none"
            />
          </div>
        </label>

        {error ? <p className="mt-3 text-xs font-semibold text-destructive">{error}</p> : null}

        <ActionButton type="submit" variant="primary" size="lg" className="mt-6 w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </ActionButton>
      </form>
    </div>
  );
}
