// Doctor & clinic ("referral partner") portal — its own token realm and session, separate from the patient,
// admin, lab and phlebotomist ones. Handles its own 401 so lib/unauthorized.ts (shared) is left unchanged.
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export class PartnerApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type PartnerType = "DOCTOR" | "CLINIC";
export type PartnerStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
export type PartnerSummary = { id: string; type: PartnerType; phone: string; status: PartnerStatus; displayName: string | null };

const TOKEN_KEY = "mdpathlabs_partner_token";
const PARTNER_KEY = "mdpathlabs_partner";

export const partnerSession = {
  save(accessToken: string, partner: PartnerSummary) {
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(PARTNER_KEY, JSON.stringify(partner));
  },
  getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(TOKEN_KEY);
  },
  getPartner(): PartnerSummary | null {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(PARTNER_KEY);
    return raw ? JSON.parse(raw) : null;
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PARTNER_KEY);
  },
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = partnerSession.getToken();
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    // Expired or removed session: clear it and go to the portal login (only when a token was actually sent).
    if (res.status === 401 && token && typeof window !== "undefined") {
      partnerSession.clear();
      if (!window.location.pathname.startsWith("/partner/login")) window.location.href = "/partner/login";
    }
    const message = body?.message ?? "Something went wrong — please try again";
    throw new PartnerApiError(Array.isArray(message) ? message[0] : message, res.status);
  }
  return body as T;
}

export type DocumentKind =
  | "MEDICAL_REGISTRATION_CERTIFICATE"
  | "QUALIFICATION_CERTIFICATE"
  | "IDENTITY_PROOF"
  | "PHOTO"
  | "ESTABLISHMENT_REGISTRATION_CERTIFICATE"
  | "OWNER_MEDICAL_REGISTRATION_CERTIFICATE"
  | "ADDRESS_PROOF"
  | "AUTHORIZATION_LETTER"
  | "OTHER";

export type Requirement = { documentKind: DocumentKind; level: "MANDATORY" | "OPTIONAL"; label: string };
export type PartnerDocument = { id: string; kind: DocumentKind; label: string; fileUrl: string; mimeType: string; sizeBytes: number; uploadedAt: string };

export type DoctorProfile = {
  fullName: string;
  medicalCouncil: string;
  registrationNumber: string;
  registrationYear: number | null;
  qualification: string;
  specialization: string | null;
  city: string;
  pincode: string;
};

export type ClinicTypeOption = { code: string; label: string; registrationNumberRequired: boolean; registrationNumberLabel: string | null };

export type ClinicProfile = {
  clinicName: string;
  clinicTypeCode: string;
  clinicType: ClinicTypeOption;
  registrationAuthority: string | null;
  registrationNumber: string | null;
  gstin: string | null;
  address: string;
  city: string;
  state: string | null;
  pincode: string;
  contactPersonName: string;
  contactPersonDesignation: string | null;
};

export type PartnerMe = {
  id: string;
  type: PartnerType;
  phone: string;
  email: string | null;
  displayName: string | null;
  status: PartnerStatus;
  editable: boolean;
  submittedAt: string | null;
  decidedAt: string | null;
  lastDecision: { status: PartnerStatus; reason: string | null; at: string } | null;
  doctorProfile: DoctorProfile | null;
  clinicProfile: ClinicProfile | null;
  documents: PartnerDocument[];
  requirements: Requirement[];
  missingDocuments: string[];
  maxDocuments: number;
};

export type DoctorApplicationInput = {
  fullName: string;
  email?: string | undefined;
  medicalCouncil: string;
  registrationNumber: string;
  registrationYear?: number | undefined;
  qualification: string;
  specialization?: string | undefined;
  city: string;
  pincode: string;
};

export type ClinicApplicationInput = {
  clinicName: string;
  clinicTypeCode: string;
  email?: string | undefined;
  registrationAuthority?: string | undefined;
  registrationNumber?: string | undefined;
  gstin?: string | undefined;
  address: string;
  city: string;
  state?: string | undefined;
  pincode: string;
  contactPersonName: string;
  contactPersonDesignation?: string | undefined;
};

export type AffiliationStatus = "REQUESTED" | "ACTIVE" | "REJECTED" | "ENDED";
export type Affiliation = {
  id: string;
  status: AffiliationStatus;
  note: string | null;
  createdAt: string;
  decidedAt: string | null;
  endedAt: string | null;
  counterpart: { id: string; name: string; city: string; detail: string };
};
export type ClinicSearchResult = { id: string; name: string; city: string; type: string };

export const partnerApi = {
  availability: () => request<{ enabled: boolean }>("/partners/availability"),

  requestOtp: (phone: string) =>
    request<{ message: string; expiresInSeconds: number; devCode?: string }>("/auth/partner/otp/request", {
      method: "POST",
      body: JSON.stringify({ phone }),
    }),
  verifyOtp: (phone: string, code: string, type: PartnerType, termsAccepted: boolean) =>
    request<{ accessToken: string; partner: PartnerSummary }>("/auth/partner/otp/verify", {
      method: "POST",
      body: JSON.stringify({ phone, code, type, termsAccepted }),
    }),
  logout: () => request<{ ok: true }>("/auth/partner/logout", { method: "POST" }),

  me: () => request<PartnerMe>("/partner/me"),
  clinicTypes: () => request<ClinicTypeOption[]>("/partner/clinic-types"),
  requirements: (clinicTypeCode?: string) =>
    request<Requirement[]>(`/partner/requirements${clinicTypeCode ? `?clinicTypeCode=${encodeURIComponent(clinicTypeCode)}` : ""}`),
  saveDoctor: (input: DoctorApplicationInput) =>
    request<PartnerMe>("/partner/application/doctor", { method: "PUT", body: JSON.stringify(input) }),
  saveClinic: (input: ClinicApplicationInput) =>
    request<PartnerMe>("/partner/application/clinic", { method: "PUT", body: JSON.stringify(input) }),
  uploadDocument: (kind: DocumentKind, file: File) => {
    const form = new FormData();
    form.append("kind", kind);
    form.append("file", file);
    return request<PartnerMe>("/partner/application/documents", { method: "POST", body: form });
  },
  removeDocument: (id: string) => request<PartnerMe>(`/partner/application/documents/${id}`, { method: "DELETE" }),
  submit: () => request<PartnerMe>("/partner/application/submit", { method: "POST", body: JSON.stringify({ declarationAccepted: true }) }),

  searchClinics: (q: string, city?: string) => {
    const params = new URLSearchParams({ q });
    if (city) params.set("city", city);
    return request<ClinicSearchResult[]>(`/partner/clinics?${params.toString()}`);
  },
  affiliations: () => request<Affiliation[]>("/partner/affiliations"),
  requestAffiliation: (clinicPartnerId: string) =>
    request<Affiliation[]>("/partner/affiliations", { method: "POST", body: JSON.stringify({ clinicPartnerId }) }),
  acceptAffiliation: (id: string, note?: string) =>
    request<Affiliation[]>(`/partner/affiliations/${id}/accept`, { method: "POST", body: JSON.stringify(note ? { note } : {}) }),
  rejectAffiliation: (id: string, note?: string) =>
    request<Affiliation[]>(`/partner/affiliations/${id}/reject`, { method: "POST", body: JSON.stringify(note ? { note } : {}) }),
  endAffiliation: (id: string, note?: string) =>
    request<Affiliation[]>(`/partner/affiliations/${id}/end`, { method: "POST", body: JSON.stringify(note ? { note } : {}) }),
};

export type ReferralKit = {
  code: string;
  issuedAt: string;
  link: string;
  qrLink: string;
  qrPngDataUrl: string;
  counts: { referredPatients: number; attributedBookings: number };
};

// ---------------------------------------------------------------- booking for a patient

export type PartnerPatientAddress = {
  id: string;
  label: string | null;
  houseNo: string | null;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string | null;
  pincode: string;
  phone: string | null;
  isDefault: boolean;
};

export type PartnerVerifiedPatient = {
  patientToken: string;
  expiresInSeconds: number;
  patient: { name: string | null; phone: string; newAccount: boolean };
  addresses: PartnerPatientAddress[];
};

export type PartnerBookingInput = {
  patientToken: string;
  collectionType: "HOME" | "CENTER";
  addressId?: string;
  collectionCenterId?: string;
  items: { itemType: "PARAMETER" | "PROFILE" | "PACKAGE" | "RADIOLOGY"; itemId: string }[];
  printedReport?: boolean;
};

export type PartnerBookingQuote = {
  items: { itemType: string; itemId: string; name: string; mrp: number; price: number }[];
  subtotal: number;
  discount: number;
  collectionFee: number;
  collectionDistanceKm: number | null;
  printedReport: boolean;
  printedReportTerms: string;
  withinRange: boolean;
  total: number;
  labName: string | null;
};

export type PartnerBookingRow = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  total: number;
  scheduledDate: string | null;
  slotLabel: string | null;
  collectionType: "HOME" | "CENTER";
  createdAt: string;
  tests: string[];
  patient: { name: string | null; phone: string };
};

export const partnerBookingsApi = {
  list: () => request<PartnerBookingRow[]>("/partner/bookings"),
  sendOtp: (phone: string) => request<{ message: string; expiresInSeconds: number; devCode?: string }>("/partner/bookings/patient/otp", { method: "POST", body: JSON.stringify({ phone }) }),
  verify: (phone: string, otp: string, name?: string) =>
    request<PartnerVerifiedPatient>("/partner/bookings/patient/verify", { method: "POST", body: JSON.stringify({ phone, otp, ...(name ? { name } : {}) }) }),
  addAddress: (patientToken: string, address: Record<string, string>) =>
    request<{ address: PartnerPatientAddress; addresses: PartnerPatientAddress[] }>("/partner/bookings/patient/addresses", {
      method: "POST",
      body: JSON.stringify({ patientToken, ...address }),
    }),
  quote: (input: PartnerBookingInput) => request<PartnerBookingQuote>("/partner/bookings/quote", { method: "POST", body: JSON.stringify(input) }),
  create: (input: PartnerBookingInput & { slotId: string; scheduledDate: string; patientConsent: true; printedReportTermsAccepted?: boolean; note?: string }) =>
    request<{ id: string; orderNumber: string; total: number; scheduledDate: string }>("/partner/bookings", { method: "POST", body: JSON.stringify(input) }),
};

export const BOOKING_STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  CONFIRMED: "Confirmed",
  PHLEBOTOMIST_ASSIGNED: "Phlebotomist assigned",
  SAMPLE_COLLECTED: "Sample collected",
  IN_LAB: "In lab",
  REPORT_READY: "Report ready",
  CANCELLED: "Cancelled",
};

export const partnerReferralApi = {
  kit: () => request<ReferralKit>("/partner/referral-kit"),
};

// ---------------------------------------------------------------- earnings & withdrawals (amounts in paise)

export type CommissionEntryType = "EARNING" | "REVERSAL" | "WITHDRAWAL" | "WITHDRAWAL_RETURNED" | "ADJUSTMENT";
export type WithdrawalStatus = "REQUESTED" | "APPROVED" | "PAID" | "REJECTED" | "CANCELLED";

export type PartnerWithdrawal = {
  id: string;
  amountPaise: number;
  tdsPaise: number;
  netPaise: number;
  status: WithdrawalStatus;
  accountLast4: string;
  utr: string | null;
  adminNote: string | null;
  createdAt: string;
  paidAt: string | null;
};

export type CommissionCategory = "ROUTINE" | "SPECIAL" | "PACKAGE";
export const COMMISSION_CATEGORIES: CommissionCategory[] = ["ROUTINE", "SPECIAL", "PACKAGE"];
export const COMMISSION_CATEGORY_LABELS: Record<CommissionCategory, string> = { ROUTINE: "Routine tests", SPECIAL: "Special tests", PACKAGE: "Packages" };
export const COMMISSION_CATEGORY_SHORT: Record<CommissionCategory, string> = { ROUTINE: "Routine", SPECIAL: "Special", PACKAGE: "Package" };

export type MouSignatureStatus = "AWAITING_SIGNATURE" | "SIGNED_UPLOADED" | "VERIFIED" | "REJECTED";

export const MOU_STATUS_LABELS: Record<MouSignatureStatus, string> = {
  AWAITING_SIGNATURE: "Waiting for acceptance",
  SIGNED_UPLOADED: "Signed copy received — verify it",
  VERIFIED: "Accepted",
  REJECTED: "Waiting for acceptance",
};

export type PartnerMou = {
  id: string;
  mouNumber: string | null;
  routinePercent: number;
  specialPercent: number;
  packagePercent: number;
  effectiveFrom: string;
  /** When the rates actually start (start date, or verify date if later); null until verified. */
  startsAt: string | null;
  signatureStatus: MouSignatureStatus;
  documentUrl: string | null;
  signedUploadedAt: string | null;
  signedUploadedBy: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  note: string | null;
  createdAt: string;
  withdrawnAt: string | null;
};

export type PartnerMouSummary = { current: PartnerMou | null; upcoming: PartnerMou | null; pending: PartnerMou | null; history: PartnerMou[] };

/** Fetches a file with the partner's login and saves it (the MOU PDF). */
async function downloadWithAuth(path: string, filename: string) {
  const token = partnerSession.getToken();
  const res = await fetch(`${API_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new PartnerApiError(body?.message ?? "Couldn't download the file", res.status);
  }
  saveBlob(await res.blob(), filename);
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type EntryCategoryAmount = { category: CommissionCategory; amountPaise: number };

export type CommissionStatement = {
  partner: { id: string; type: PartnerType; displayName: string | null; referralCode: string | null };
  month: string;
  from: string;
  to: string;
  openingBalancePaise: number;
  closingBalancePaise: number;
  totals: { earnedPaise: number; reversedPaise: number; adjustmentsPaise: number; withdrawnPaise: number; bookings: number };
  categoryTotals: Record<CommissionCategory, number>;
  entries: { id: string; type: CommissionEntryType; amountPaise: number; createdAt: string; orderNumber: string | null; categories: EntryCategoryAmount[]; note: string | null }[];
};

export type PartnerEarnings = {
  programme: { enabled: boolean; ratePercent: number; holdDays: number; minWithdrawalRupees: number; tdsPercent: number };
  totals: { earnedPaise: number; reversedPaise: number; adjustmentsPaise: number; pendingPaise: number; balancePaise: number; availablePaise: number; paidOutPaise: number };
  maxWithdrawalRupees: number;
  canWithdraw: boolean;
  withdrawBlockedReason: string | null;
  bankAccount: { accountHolderName: string; accountLast4: string; ifsc: string; updatedAt: string } | null;
  entries: { id: string; type: CommissionEntryType; amountPaise: number; availableAt: string; createdAt: string; orderNumber: string | null; categories: EntryCategoryAmount[]; note: string | null }[];
  withdrawals: PartnerWithdrawal[];
  /** Net commission per category (after reversals). */
  categoryTotals: Record<CommissionCategory, number>;
  counts: { referredBookings: number; earningBookings: number };
  mou: { current: PartnerMou | null; upcoming: PartnerMou | null; pending: PartnerMou | null };
};

export const partnerEarningsApi = {
  get: () => request<PartnerEarnings>("/partner/earnings"),
  saveBankAccount: (input: { accountHolderName: string; accountNumber: string; ifsc: string }) =>
    request<PartnerEarnings>("/partner/earnings/bank-account", { method: "PUT", body: JSON.stringify(input) }),
  withdraw: (amountRupees: number) => request<PartnerEarnings>("/partner/earnings/withdrawals", { method: "POST", body: JSON.stringify({ amountRupees }) }),
  cancelWithdrawal: (id: string) => request<PartnerEarnings>(`/partner/earnings/withdrawals/${id}/cancel`, { method: "POST" }),
  statement: (month: string) => request<CommissionStatement>(`/partner/earnings/statement?month=${encodeURIComponent(month)}`),
  mous: () => request<PartnerMouSummary>("/partner/earnings/mous"),
  sendMouOtp: (mouId: string) => request<{ message: string; expiresInSeconds: number; devCode?: string }>(`/partner/earnings/mous/${mouId}/accept/otp`, { method: "POST" }),
  acceptMou: (mouId: string, otp: string) => request<PartnerMouSummary>(`/partner/earnings/mous/${mouId}/accept`, { method: "POST", body: JSON.stringify({ otp }) }),
  downloadMou: (m: PartnerMou) => downloadWithAuth(`/partner/earnings/mous/${m.id}/document`, `${m.mouNumber ?? "MOU"}.pdf`),
  uploadSignedMou: (mouId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<PartnerMouSummary>(`/partner/earnings/mous/${mouId}/signed`, { method: "POST", body: form });
  },
};

/** "2026-11" for the current month in IST. */
export function currentIstMonth(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 7);
}

/** Last `count` months, newest first, as { value: "2026-11", label: "November 2026" }. */
export function recentMonths(count = 12): { value: string; label: string }[] {
  const [y, m] = currentIstMonth().split("-").map(Number) as [number, number];
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    return { value: d.toISOString().slice(0, 7), label: d.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }) };
  });
}

/** Downloads rows as a CSV file (opens fine in Excel). */
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blob = new Blob(["\ufeff" + rows.map((r) => r.map(esc).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Rupees for a CSV cell: 1234.5 → "1234.50". */
export const paiseToRupees = (paise: number) => (paise / 100).toFixed(2);

/** ₹1,234.50 */
export function formatPaise(paise: number): string {
  const sign = paise < 0 ? "−" : "";
  return `${sign}₹${(Math.abs(paise) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const COMMISSION_ENTRY_LABELS: Record<CommissionEntryType, string> = {
  EARNING: "Commission",
  REVERSAL: "Reversed (booking cancelled / refunded)",
  WITHDRAWAL: "Withdrawal",
  WITHDRAWAL_RETURNED: "Withdrawal returned",
  ADJUSTMENT: "Adjustment",
};

export const WITHDRAWAL_STATUS_LABELS: Record<WithdrawalStatus, string> = {
  REQUESTED: "Requested",
  APPROVED: "Approved — transfer pending",
  PAID: "Paid",
  REJECTED: "Not processed",
  CANCELLED: "Cancelled",
};

export const WITHDRAWAL_STATUS_TONES: Record<WithdrawalStatus, "warning" | "primary" | "success" | "danger" | "neutral"> = {
  REQUESTED: "warning",
  APPROVED: "primary",
  PAID: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
};

export const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  DRAFT: "Application not submitted",
  PENDING: "Under review",
  APPROVED: "Approved",
  REJECTED: "Changes needed",
  SUSPENDED: "Suspended",
};

export const PARTNER_STATUS_TONES: Record<PartnerStatus, "neutral" | "warning" | "success" | "danger"> = {
  DRAFT: "neutral",
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  SUSPENDED: "danger",
};
