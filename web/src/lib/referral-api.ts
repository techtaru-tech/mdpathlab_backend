// Referral links (Phase 2): the public /r/:code lookup and the logged-in patient's own referral. Uses the patient
// session; handles its own errors so the shared lib/api.ts stays unchanged.
import { session } from "@/lib/api";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export class ReferralApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}, withSession = false): Promise<T> {
  const token = withSession ? session.getToken() : null;
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = body?.message ?? "Something went wrong — please try again";
    throw new ReferralApiError(Array.isArray(message) ? message[0] : message, res.status);
  }
  return body as T;
}

export type ReferralPartnerPublic = { type: "DOCTOR" | "CLINIC"; displayName: string | null; city?: string | null };
export type ReferralLookup = { valid: true; partner: ReferralPartnerPublic } | { valid: false };
export type ClaimStatus = "BOUND" | "ALREADY_REFERRED" | "NOT_ELIGIBLE" | "INVALID";

export const referralApi = {
  lookup: (code: string) => request<ReferralLookup>(`/referrals/${encodeURIComponent(code)}`),
  claim: (code: string, source: "LINK" | "QR", capturedAt?: string) =>
    request<{ status: ClaimStatus; partner?: ReferralPartnerPublic }>(
      "/me/referral/claim",
      { method: "POST", body: JSON.stringify({ code, source, ...(capturedAt ? { capturedAt } : {}) }) },
      true,
    ),
  mine: () =>
    request<{ referral: { partner: ReferralPartnerPublic; boundAt: string; status: "ACTIVE" | "DISPUTED" } | null }>("/me/referral", {}, true),
};

// The code from a referral link, remembered for 7 days so it survives sign-up / login. Same convention as
// prescriptionBooking.ts: plain localStorage, every access guarded.
const STORAGE_KEY = "mdpathlabs_pending_referral";
const TTL_MS = 7 * 24 * 3600_000;
export type PendingReferral = { code: string; source: "LINK" | "QR"; capturedAt: string };

export const pendingReferral = {
  get(): PendingReferral | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const p = JSON.parse(raw) as PendingReferral;
      if (Date.now() - Date.parse(p.capturedAt) > TTL_MS) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return p;
    } catch {
      return null;
    }
  },
  save(p: PendingReferral) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } catch {
      // Ignore — the patient can still use the link again.
    }
  },
  clear() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore.
    }
  },
};

export const partnerTitle = (p: ReferralPartnerPublic) => p.displayName || (p.type === "CLINIC" ? "your clinic" : "your doctor");
