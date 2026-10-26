// Admin side of partner earnings & payouts. Kept out of admin-api.ts so that shared file is unchanged; it reuses the
// existing admin session and 401 handling. Amounts are paise.
import { adminSession, AdminApiError } from "@/lib/admin-api";
import { handleUnauthorized } from "@/lib/unauthorized";
import type { CommissionEntryType, PartnerStatus, PartnerType, WithdrawalStatus } from "@/lib/partner-api";

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

export type CommissionSettings = {
  enabled: boolean;
  activeSince: string | null;
  ratePercent: number;
  holdDays: number;
  minWithdrawalRupees: number;
  tdsPercent: number;
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
};

export type CommissionBreakdownLine = { name: string; itemType: string; priceRupees: number; discountRupees: number; baseRupees: number; ratePercent: number; amountPaise: number };

export const adminPayoutsApi = {
  rates: (type: RateItemType, q: string, page = 1) =>
    request<{ items: CommissionRateRow[]; total: number; page: number; pageSize: number; defaultRatePercent: number }>(
      `/admin/payouts/rates?${new URLSearchParams({ type, page: String(page), ...(q.trim() ? { q: q.trim() } : {}) }).toString()}`,
    ),
  setRates: (changes: { itemType: RateItemType; itemId: string; ratePercent: number | null }[], reason?: string) =>
    request<{ updated: number }>("/admin/payouts/rates", { method: "PUT", body: JSON.stringify({ changes, ...(reason ? { reason } : {}) }) }),
  settings: () => request<CommissionSettings>("/admin/payouts/settings"),
  updateSettings: (input: Partial<Omit<CommissionSettings, "activeSince" | "updatedAt">> & { reason?: string }) =>
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
};
