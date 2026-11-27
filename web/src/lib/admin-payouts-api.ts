// Admin side of partner earnings & payouts. Kept out of admin-api.ts so that shared file is unchanged; it reuses the
// existing admin session and 401 handling. Amounts are paise.
import { adminSession, AdminApiError } from "@/lib/admin-api";
import { handleUnauthorized } from "@/lib/unauthorized";
import { saveBlob, type CommissionCategory, type CommissionEntryType, type CommissionStatement, type PartnerMou, type PartnerStatus, type PartnerType, type WithdrawalStatus } from "@/lib/partner-api";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = adminSession.getToken();
  // A file upload (FormData) sets its own multipart Content-Type.
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  const init: RequestInit = {
    ...options,
    headers: { ...(isForm ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
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

export type CommissionSettings = {
  enabled: boolean;
  activeSince: string | null;
  ratePercent: number;
  holdDays: number;
  minWithdrawalRupees: number;
  tdsPercent: number;
  /** The terms new MOUs are made with; mouTermsIsDefault = the standard draft. */
  mouTerms: string;
  mouTermsIsDefault: boolean;
  mouPlaceholders: { key: string; meaning: string }[];
  /** MD Path Lab's signatory, printed with the signature + stamp image on every MOU. */
  mouSignatoryName: string | null;
  mouSignatoryDesignation: string | null;
  mouSignatureUrl: string | null;
  updatedAt: string;
};

type PartnerRef = { id: string; type: PartnerType; displayName: string | null; phone: string };

export type AdminWithdrawalRow = {
  id: string;
  amountPaise: number;
  tdsPaise: number;
  netPaise: number;
  status: WithdrawalStatus;
  accountHolderName: string;
  accountLast4: string;
  ifsc: string;
  utr: string | null;
  createdAt: string;
  decidedAt: string | null;
  paidAt: string | null;
  partner: PartnerRef;
};

export type AdminWithdrawalDetail = Omit<AdminWithdrawalRow, "partner"> & {
  partnerId: string;
  accountNumber: string | null;
  adminNote: string | null;
  partner: PartnerRef & { email: string | null; status: PartnerStatus };
  partnerTotals: { balancePaise: number; availablePaise: number; pendingPaise: number; earnedPaise: number; reversedPaise: number; adjustmentsPaise: number };
};

export type AdminBalanceRow = {
  partner: PartnerRef & { status: PartnerStatus };
  balancePaise: number;
  pendingPaise: number;
  availablePaise: number;
  paidOutPaise: number;
};

export type AdminPartnerLedger = {
  partner: PartnerRef & { status: PartnerStatus };
  totals: AdminWithdrawalDetail["partnerTotals"];
  bankAccount: { accountHolderName: string; accountLast4: string; ifsc: string; updatedAt: string } | null;
  entries: {
    id: string;
    type: CommissionEntryType;
    amountPaise: number;
    baseRupees: number | null;
    ratePercent: string | null;
    breakdown: CommissionBreakdownLine[] | null;
    availableAt: string;
    note: string | null;
    createdAt: string;
    order: { orderNumber: string } | null;
  }[];
};

export type RateItemType = "PARAMETER" | "PROFILE" | "PACKAGE" | "RADIOLOGY";

export type CommissionRateRow = {
  itemType: RateItemType;
  itemId: string;
  name: string;
  code: string | null;
  priceRupees: number;
  status: string;
  /** null = no own rate; the default applies */
  ratePercent: number | null;
  /** Routine / Special (packages are always Package) — picks the partner's MOU rate. */
  category: CommissionCategory;
};

export type CommissionBreakdownLine = {
  name: string;
  itemType: string;
  category?: CommissionCategory;
  priceRupees?: number;
  discountRupees?: number;
  baseRupees?: number;
  ratePercent?: number;
  amountPaise: number;
};

export type PartnerMous = { current: PartnerMou | null; upcoming: PartnerMou | null; pending: PartnerMou | null; history: PartnerMou[] };

export type CommissionReportRow = {
  partner: { id: string; type: PartnerType; displayName: string | null; phone: string; referralCode: string | null };
  bookings: number;
  earnedPaise: number;
  reversedPaise: number;
  adjustmentsPaise: number;
  netPaise: number;
  categoryTotals: Record<CommissionCategory, number>;
  paidOutPaise: number;
  tdsPaise: number;
  balanceNowPaise: number;
};

export type CommissionReport = {
  from: string;
  to: string;
  rows: CommissionReportRow[];
  totals: Omit<CommissionReportRow, "partner" | "balanceNowPaise">;
};

export const adminPayoutsApi = {
  rates: (type: RateItemType, q: string, page = 1) =>
    request<{ items: CommissionRateRow[]; total: number; page: number; pageSize: number; defaultRatePercent: number }>(
      `/admin/payouts/rates?${new URLSearchParams({ type, page: String(page), ...(q.trim() ? { q: q.trim() } : {}) }).toString()}`,
    ),
  setRates: (changes: { itemType: RateItemType; itemId: string; ratePercent: number | null }[], reason?: string) =>
    request<{ updated: number }>("/admin/payouts/rates", { method: "PUT", body: JSON.stringify({ changes, ...(reason ? { reason } : {}) }) }),
  settings: () => request<CommissionSettings>("/admin/payouts/settings"),
  uploadSignature: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<CommissionSettings>("/admin/payouts/settings/signature", { method: "POST", body: form });
  },
  removeSignature: () => request<CommissionSettings>("/admin/payouts/settings/signature", { method: "DELETE" }),
  updateSettings: (
    input: Partial<Omit<CommissionSettings, "activeSince" | "updatedAt" | "mouTerms" | "mouTermsIsDefault" | "mouPlaceholders" | "mouSignatureUrl">> & {
      mouTerms?: string | null;
      reason?: string;
    },
  ) =>
    request<CommissionSettings>("/admin/payouts/settings", { method: "PUT", body: JSON.stringify(input) }),
  health: () => request<{ heartbeat: { lastRunAt: string | null; lastSuccessAt: string | null; lastError: string | null } | null; stale: boolean }>("/admin/payouts/health"),
  runNow: () => request<{ earned: number; reversed: number; skipped?: boolean }>("/admin/payouts/run-now", { method: "POST" }),
  withdrawals: (status?: WithdrawalStatus, page = 1) =>
    request<{ items: AdminWithdrawalRow[]; total: number; page: number; pageSize: number; counts: Partial<Record<WithdrawalStatus, number>> }>(
      `/admin/payouts/withdrawals?${new URLSearchParams({ ...(status ? { status } : {}), page: String(page) }).toString()}`,
    ),
  withdrawal: (id: string) => request<AdminWithdrawalDetail>(`/admin/payouts/withdrawals/${id}`),
  approve: (id: string) => request<AdminWithdrawalDetail>(`/admin/payouts/withdrawals/${id}/approve`, { method: "POST" }),
  reject: (id: string, reason: string) => request<AdminWithdrawalDetail>(`/admin/payouts/withdrawals/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }),
  markPaid: (id: string, utr: string) => request<AdminWithdrawalDetail>(`/admin/payouts/withdrawals/${id}/paid`, { method: "POST", body: JSON.stringify({ utr }) }),
  balances: () => request<AdminBalanceRow[]>("/admin/payouts/balances"),
  ledger: (partnerId: string) => request<AdminPartnerLedger>(`/admin/payouts/partners/${partnerId}`),
  adjust: (partnerId: string, amountRupees: number, reason: string) =>
    request<AdminPartnerLedger>(`/admin/payouts/partners/${partnerId}/adjust`, { method: "POST", body: JSON.stringify({ amountRupees, reason }) }),
  setCategories: (changes: { itemType: Exclude<RateItemType, "PACKAGE">; itemId: string; category: "ROUTINE" | "SPECIAL" }[]) =>
    request<{ updated: number }>("/admin/payouts/categories", { method: "PUT", body: JSON.stringify({ changes }) }),
  report: (from: string, to: string) => request<CommissionReport>(`/admin/payouts/report?${new URLSearchParams({ from, to }).toString()}`),
  statement: (partnerId: string, month: string) => request<CommissionStatement>(`/admin/payouts/partners/${partnerId}/statement?month=${encodeURIComponent(month)}`),
  mous: (partnerId: string) => request<PartnerMous>(`/admin/payouts/partners/${partnerId}/mous`),
  createMou: (partnerId: string, input: { routinePercent: number; specialPercent: number; packagePercent: number; effectiveFrom?: string; note?: string }) =>
    request<PartnerMous & { mou: PartnerMou }>(`/admin/payouts/partners/${partnerId}/mous`, { method: "POST", body: JSON.stringify(input) }),
  withdrawMou: (partnerId: string, mouId: string) => request<PartnerMous>(`/admin/payouts/partners/${partnerId}/mous/${mouId}`, { method: "DELETE" }),
  downloadMou: async (partnerId: string, m: PartnerMou) => {
    const token = adminSession.getToken();
    const res = await fetch(`${API_URL}/admin/payouts/partners/${partnerId}/mous/${m.id}/pdf`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new AdminApiError("Couldn't download the MOU", res.status);
    saveBlob(await res.blob(), `${m.mouNumber ?? "MOU"}.pdf`);
  },
  mousToVerify: () => request<(PartnerMou & { partner: PartnerRef })[]>("/admin/payouts/mous/to-verify"),
  verifyMou: (partnerId: string, mouId: string) => request<PartnerMous>(`/admin/payouts/partners/${partnerId}/mous/${mouId}/verify`, { method: "POST" }),
  rejectMou: (partnerId: string, mouId: string, reason: string) =>
    request<PartnerMous>(`/admin/payouts/partners/${partnerId}/mous/${mouId}/reject`, { method: "POST", body: JSON.stringify({ reason }) }),
  uploadMouDocument: (partnerId: string, mouId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<PartnerMous>(`/admin/payouts/partners/${partnerId}/mous/${mouId}/document`, { method: "POST", body: form });
  },
};
