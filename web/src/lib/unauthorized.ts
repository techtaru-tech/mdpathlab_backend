// When the API answers 401 to a request that carried a token, the session has expired (or the account was
// switched off). Clear it and send the person to the matching login page instead of leaving them on a screen of
// empty lists that look like "no data". A 401 on the login calls themselves (no token sent) is left alone.
const LOGIN_PATH = {
  patient: "/login",
  admin: "/admin/login",
  lab: "/lab/login",
  phlebotomist: "/phlebotomist/login",
} as const;

export function handleUnauthorized(kind: keyof typeof LOGIN_PATH, options: RequestInit | undefined, clearSession: () => void): void {
  if (typeof window === "undefined") return;
  const sentToken = Boolean((options?.headers as Record<string, string> | undefined)?.["Authorization"]);
  if (!sentToken) return;
  clearSession();
  const login = LOGIN_PATH[kind];
  if (window.location.pathname.startsWith(login)) return;
  const back = kind === "patient" ? "?redirect=" + encodeURIComponent(window.location.pathname + window.location.search) : "";
  window.location.href = login + back;
}
