// Admin side of the doctor & clinic ("referral partner") screens. Kept out of admin-api.ts so that shared file is
// unchanged; it reuses the existing admin session and 401 handling.
import { adminSession, AdminApiError } from "@/lib/admin-api";
import { handleUnauthorized } from "@/lib/unauthorized";
import type { DocumentKind, PartnerStatus, PartnerType, Requirement } from "@/lib/partner-api";

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

export type AdminPartnerRow = {
  id: string;
  type: PartnerType;
  status: PartnerStatus;
  displayName: string | null;
  phone: string;
  email: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  doctorProfile: { city: string; specialization: string | null; medicalCouncil: string; registrationNumber: string } | null;
  clinicProfile: { city: string; clinicType: { label: string } } | null;
};

export type AdminPartnerEvent = {
  id: string;
  event: string;
  fromStatus: PartnerStatus | null;
  toStatus: PartnerStatus | null;
  reason: string | null;
  actorType: "PARTNER" | "ADMIN" | "SYSTEM";
  actorLabel: string | null;
  affiliationId: string | null;
  createdAt: string;
};

export type AdminAffiliation = {
  id: string;
  status: "REQUESTED" | "ACTIVE" | "REJECTED" | "ENDED";
  note: string | null;
  createdAt: string;
  decidedAt: string | null;
  endedAt: string | null;
  clinic?: { partnerId: string; clinicName: string; city: string };
  doctor?: { partnerId: string; fullName: string; city: string };
};

export type AdminPartnerDetail = {
  id: string;
  type: PartnerType;
  status: PartnerStatus;
  phone: string;
  email: string | null;
  displayName: string | null;
  createdAt: string;
  submittedAt: string | null;
  decidedAt: string | null;
  declarationAcceptedAt: string | null;
  doctorProfile:
    | ({
        fullName: string;
        medicalCouncil: string;
        registrationNumber: string;
        registrationYear: number | null;
        qualification: string;
        specialization: string | null;
        city: string;
        pincode: string;
        affiliations: AdminAffiliation[];
      })
    | null;
  clinicProfile:
    | ({
        clinicName: string;
        clinicType: { code: string; label: string };
        registrationAuthority: string | null;
        registrationNumber: string | null;
        gstin: string | null;
        address: string;
        city: string;
        state: string | null;
        pincode: string;
        contactPersonName: string;
        contactPersonDesignation: string | null;
        affiliations: AdminAffiliation[];
      })
    | null;
  documents: { id: string; kind: DocumentKind; label: string; fileUrl: string; mimeType: string; sizeBytes: number; uploadedAt: string; removedAt: string | null }[];
  events: AdminPartnerEvent[];
  requirements: Requirement[];
  missingDocuments: string[];
  possibleDuplicates: {
    id: string;
    type: PartnerType;
    status: PartnerStatus;
    displayName: string | null;
    matchedOn: string[];
    registration: string | null;
  }[];
};

export type AdminClinicType = {
  code: string;
  label: string;
  registrationNumberRequired: boolean;
  registrationNumberLabel: string | null;
  isActive: boolean;
  sortOrder: number;
  _count: { clinics: number };
  requirements: { documentKind: DocumentKind; level: "MANDATORY" | "OPTIONAL" }[];
};

export type PartnerDecision = "approve" | "reject" | "suspend" | "reactivate";

export type FeatureSwitches = { referralPartnersEnabled: boolean; referralsEnabled: boolean };

export const adminPartnersApi = {
  list: (params: { type?: PartnerType | undefined; status?: PartnerStatus | undefined; q?: string | undefined; page?: number; pageSize?: number }) => {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") search.set(k, String(v));
    return request<{ items: AdminPartnerRow[]; total: number; page: number; pageSize: number }>(`/admin/partners?${search.toString()}`);
  },
  summary: () => request<{ type: PartnerType; status: PartnerStatus; count: number }[]>("/admin/partners/summary"),
  get: (id: string) => request<AdminPartnerDetail>(`/admin/partners/${id}`),
  decide: (id: string, decision: PartnerDecision, reason?: string) =>
    request<AdminPartnerDetail>(`/admin/partners/${id}/${decision}`, { method: "POST", body: JSON.stringify(reason ? { reason } : {}) }),

  decideAffiliation: (id: string, decision: "approve" | "reject" | "end", reason: string) =>
    request<AdminAffiliation>(`/admin/affiliations/${id}/${decision}`, { method: "POST", body: JSON.stringify({ reason }) }),

  features: () => request<FeatureSwitches>("/admin/partner-settings/features"),
  setFeatures: (input: Partial<FeatureSwitches>) =>
    request<FeatureSwitches>("/admin/partner-settings/features", { method: "PUT", body: JSON.stringify(input) }),

  clinicTypes: () => request<AdminClinicType[]>("/admin/partner-settings/clinic-types"),
  createClinicType: (input: { code: string; label: string; registrationNumberRequired?: boolean; registrationNumberLabel?: string; sortOrder?: number }) =>
    request<AdminClinicType>("/admin/partner-settings/clinic-types", { method: "POST", body: JSON.stringify(input) }),
  updateClinicType: (
    code: string,
    input: Partial<{ label: string; registrationNumberRequired: boolean; registrationNumberLabel: string; isActive: boolean; sortOrder: number }>,
  ) => request<AdminClinicType>(`/admin/partner-settings/clinic-types/${code}`, { method: "PATCH", body: JSON.stringify(input) }),
  requirements: (partnerType: PartnerType, clinicTypeCode?: string) => {
    const search = new URLSearchParams({ partnerType });
    if (clinicTypeCode) search.set("clinicTypeCode", clinicTypeCode);
    return request<Requirement[]>(`/admin/partner-settings/requirements?${search.toString()}`);
  },
  replaceRequirements: (input: {
    partnerType: PartnerType;
    clinicTypeCode?: string;
    items: { documentKind: DocumentKind; level: "MANDATORY" | "OPTIONAL" }[];
    reason: string;
  }) => request<Requirement[]>("/admin/partner-settings/requirements", { method: "PUT", body: JSON.stringify(input) }),
};

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  MEDICAL_REGISTRATION_CERTIFICATE: "Medical registration certificate",
  QUALIFICATION_CERTIFICATE: "Qualification certificate",
  IDENTITY_PROOF: "Identity proof",
  PHOTO: "Photo",
  ESTABLISHMENT_REGISTRATION_CERTIFICATE: "Establishment registration certificate",
  OWNER_MEDICAL_REGISTRATION_CERTIFICATE: "Owner doctor's medical registration certificate",
  ADDRESS_PROOF: "Address proof",
  AUTHORIZATION_LETTER: "Authorisation letter",
  OTHER: "Other supporting document",
};
