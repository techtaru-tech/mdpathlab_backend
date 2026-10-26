// Admin side of referral attribution (Phase 2). Reuses the admin session and 401 handling, like admin-partners-api.ts.
import { adminSession, AdminApiError } from "@/lib/admin-api";
import { handleUnauthorized } from "@/lib/unauthorized";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = adminSession.getToken();
  const init: RequestInit = {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  };
  const res = await fetch(`${API_URL}${path}`, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized("admin", init, () => adminSession.clear());
    const message = body?.message ?? "Something went wrong — please try again";
    throw new AdminApiError(Array.isArray(message) ? message[0] : message, res.status);
  }
  return body as T;
}

export type ReferralStatus = "ACTIVE" | "DISPUTED" | "REVOKED";
export type AttemptOutcome = "BOUND" | "ALREADY_REFERRED" | "EXISTING_CUSTOMER" | "SELF_REFERRAL" | "PARTNER_NOT_ACTIVE" | "INVALID_CODE";
type PartnerRef = { id: string; type: "DOCTOR" | "CLINIC"; displayName: string | null };

export type ReferralEvent = {
  id: string;
  event: string;
  fromPartnerId: string | null;
  toPartnerId: string | null;
  fromStatus: ReferralStatus | null;
  toStatus: ReferralStatus | null;
  reason: string | null;
  actorType: "PATIENT" | "ADMIN" | "SYSTEM";
  actorLabel: string | null;
  createdAt: string;
};

export type PatientReferralDetail = {
  patient: { id: string; name: string | null; phone: string; createdAt: string; _count: { orders: number } };
  referral: {
    id: string;
    status: ReferralStatus;
    source: string;
    boundVia: string;
    boundAt: string;
    policyVersion: string;
    partner: PartnerRef & { status: string };
    code: { code: string } | null;
    events: ReferralEvent[];
    _count: { orderAttributions: number };
  } | null;
};

export type RecentReferral = {
  id: string;
  status: ReferralStatus;
  source: string;
  boundAt: string;
  user: { id: string; name: string | null; phone: string };
  partner: PartnerRef;
  _count: { orderAttributions: number };
};

export type ReferralAttemptRow = {
  id: string;
  outcome: AttemptOutcome;
  codeAttempted: string;
  createdAt: string;
  partner: PartnerRef | null;
  user: { id: string; phone: string; name: string | null } | null;
};

export type ReferralHealth = {
  enabled: boolean;
  stale: boolean;
  retrying: number;
  heartbeat: { lastRunAt: string | null; lastSuccessAt: string | null; lastProcessed: number; lastBacklog: number; lastError: string | null } | null;
  needsAttention: { orderId: string; attempts: number; lastError: string; lastAttemptAt: string }[];
};

export type PartnerReferralSummary = {
  codes: { id: string; code: string; issuedAt: string; retiredAt: string | null; retiredReason: string | null; link: string }[];
  referredPatients: Partial<Record<ReferralStatus, number>>;
  attributedBookings: number;
  attemptsLast30Days: Partial<Record<AttemptOutcome, number>>;
};

const post = <T,>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) });

export const adminReferralsApi = {
  recent: (page = 1) => request<{ items: RecentReferral[]; total: number; page: number; pageSize: number }>(`/admin/referrals?page=${page}`),
  health: () => request<ReferralHealth>("/admin/referrals/health"),
  attempts: (page = 1, outcome?: AttemptOutcome) =>
    request<{ items: ReferralAttemptRow[]; total: number; page: number; pageSize: number }>(
      `/admin/referrals/attempts?page=${page}${outcome ? `&outcome=${outcome}` : ""}`,
    ),
  findPatient: (phone: string) => request<PatientReferralDetail>(`/admin/referrals/patient?phone=${encodeURIComponent(phone)}`),
  assign: (userId: string, partnerId: string, reason: string) => post<PatientReferralDetail>(`/admin/referrals/patient/${userId}/assign`, { partnerId, reason }),
  reassign: (userId: string, partnerId: string, reason: string) => post<PatientReferralDetail>(`/admin/referrals/patient/${userId}/reassign`, { partnerId, reason }),
  setStatus: (userId: string, action: "revoke" | "dispute" | "restore", reason: string) =>
    post<PatientReferralDetail>(`/admin/referrals/patient/${userId}/${action}`, { reason }),
  retry: (orderId: string) => post<{ recorded: boolean; reason: string }>(`/admin/referrals/snapshots/${orderId}/retry`, {}),
  partner: (partnerId: string) => request<PartnerReferralSummary>(`/admin/referrals/partner/${partnerId}`),
  reissue: (partnerId: string, reason: string) => post<PartnerReferralSummary>(`/admin/referrals/partner/${partnerId}/reissue-code`, { reason }),
};

export const ATTEMPT_LABELS: Record<AttemptOutcome, string> = {
  BOUND: "Linked",
  ALREADY_REFERRED: "Already referred",
  EXISTING_CUSTOMER: "Existing customer",
  SELF_REFERRAL: "Self-referral",
  PARTNER_NOT_ACTIVE: "Partner not active",
  INVALID_CODE: "Invalid code",
};
