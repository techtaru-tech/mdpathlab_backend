const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export class LabApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function labAuthed(options?: RequestInit): RequestInit {
  const token = labSession.getToken();
  return { ...options, headers: { ...options?.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) } };
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = body?.message ?? "Something went wrong — please try again";
    throw new LabApiError(Array.isArray(message) ? message[0] : message, res.status);
  }
  return body as T;
}

export type LabProfile = { id: string; email: string; name: string };

const LAB_TOKEN_KEY = "mdpathlabs_lab_token";
const LAB_KEY = "mdpathlabs_lab";

export const labSession = {
  save(accessToken: string, lab: LabProfile) {
    localStorage.setItem(LAB_TOKEN_KEY, accessToken);
    localStorage.setItem(LAB_KEY, JSON.stringify(lab));
  },
  getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(LAB_TOKEN_KEY);
  },
  getLab(): LabProfile | null {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(LAB_KEY);
    return raw ? JSON.parse(raw) : null;
  },
  clear() {
    localStorage.removeItem(LAB_TOKEN_KEY);
    localStorage.removeItem(LAB_KEY);
  },
};

export const labAuthApi = {
  login: (email: string, password: string) =>
    request<{ accessToken: string; lab: LabProfile }>("/lab/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
};

export type LabOrder = {
  id: string;
  orderNumber: string;
  status: "PENDING_PAYMENT" | "CONFIRMED" | "PHLEBOTOMIST_ASSIGNED" | "SAMPLE_COLLECTED" | "IN_LAB" | "REPORT_READY" | "CANCELLED";
  paymentMethod: "ONLINE" | "COD";
  collectionType: "HOME" | "CENTER";
  scheduledDate: string | null;
  total: number;
  createdAt: string;
  user: { id: string; phone: string; name: string | null };
  items: { id: string; itemName: string; price: number }[];
  slot: { label: string } | null;
  address: { line1: string; city: string; pincode: string } | null;
  statusLogs: { status: string; note: string | null; createdAt: string }[];
  phlebotomist: { id: string; user: { name: string | null; phone: string } } | null;
  reports: { id: string; fileUrl: string | null; status: string }[];
  handedOverAt: string | null;
  sampleReceivedAt: string | null;
  sampleBarcode: string | null;
};

export type AvailablePhlebotomist = {
  id: string;
  name: string | null;
  phone: string;
  employeeCode: string;
  coverageCity: string | null;
  available: boolean;
  reason: string | null;
};

export const labOrdersApi = {
  list: (status?: string) => request<LabOrder[]>(`/lab/orders${status ? `?status=${status}` : ""}`, labAuthed()),
  get: (id: string) => request<LabOrder>(`/lab/orders/${id}`, labAuthed()),
  receiveSample: (id: string) => request<LabOrder>(`/lab/orders/${id}/receive-sample`, labAuthed({ method: "PATCH" })),
  availablePhlebotomists: (id: string) => request<AvailablePhlebotomist[]>(`/lab/orders/${id}/available-phlebotomists`, labAuthed()),
  updateStatus: (id: string, dto: { status: string; note?: string; phlebotomistId?: string }) =>
    request<LabOrder>(`/lab/orders/${id}/status`, labAuthed({ method: "PATCH", body: JSON.stringify(dto) })),
};

export type LabPhlebotomist = {
  id: string;
  employeeCode: string;
  vehicleType: string | null;
  vehicleNumber: string | null;
  status: "ACTIVE" | "INACTIVE" | "ON_LEAVE";
  user: { name: string | null; phone: string };
};

export const labPhlebotomistsApi = {
  list: () => request<LabPhlebotomist[]>("/lab/phlebotomists", labAuthed()),
  create: (dto: { phone: string; name: string; employeeCode: string; vehicleType?: string; vehicleNumber?: string }) =>
    request<LabPhlebotomist>("/lab/phlebotomists", labAuthed({ method: "POST", body: JSON.stringify(dto) })),
  update: (id: string, dto: { status?: string; vehicleType?: string; vehicleNumber?: string }) =>
    request<LabPhlebotomist>(`/lab/phlebotomists/${id}`, labAuthed({ method: "PATCH", body: JSON.stringify(dto) })),
};

export type LabResultRow = { parameterId: string; name: string; value: string | null; unit: string | null; enteredAt: string | null };

export const labResultsApi = {
  list: (orderId: string) => request<LabResultRow[]>(`/lab/orders/${orderId}/results`, labAuthed()),
  upsert: (orderId: string, dto: { parameterId: string; value: string; unit?: string }) =>
    request<LabResultRow>(`/lab/orders/${orderId}/results`, labAuthed({ method: "POST", body: JSON.stringify(dto) })),
};

export type LabCatalogueItem = { itemType: "PARAMETER" | "PROFILE" | "PACKAGE"; itemId: string; name?: string };

export const labCatalogueApi = {
  get: () => request<{ available: LabCatalogueItem[]; selected: LabCatalogueItem[] }>("/lab/catalogue", labAuthed()),
  set: (items: { itemType: "PARAMETER" | "PROFILE" | "PACKAGE"; itemId: string }[]) =>
    request<LabCatalogueItem[]>("/lab/catalogue", labAuthed({ method: "PATCH", body: JSON.stringify({ items }) })),
};

export type LabPrescriptionStage =
  | "UPLOADED"
  | "UNDER_REVIEW"
  | "ACTION_REQUIRED"
  | "REVIEWED"
  | "READY_FOR_BOOKING"
  | "BOOKING_CONFIRMED"
  | null;

export type LabPrescriptionRecommendedTest = {
  id: string;
  itemType: "PARAMETER" | "PROFILE" | "PACKAGE";
  itemId: string;
  name: string;
  shortDescription: string | null;
  price: number;
  mrp: number;
  available: boolean;
  unavailableNote: string | null;
  selected: boolean;
};

export type LabPrescriptionPatient = {
  name: string | null;
  phone: string;
  email: string | null;
  gender: string | null;
  dob: string | null;
  city: string | null;
};

export type LabPrescription = {
  id: string;
  fileUrl: string;
  note: string | null;
  status: "PENDING" | "REVIEWED";
  pincode: string | null;
  createdAt: string;
  labStage: LabPrescriptionStage;
  clarificationNote: string | null;
  patientReply: string | null;
  user: LabPrescriptionPatient;
  recommendedTests: LabPrescriptionRecommendedTest[];
};

export type LabSearchableCatalogueItem = {
  itemType: "PARAMETER" | "PROFILE" | "PACKAGE";
  itemId: string;
  name: string;
  shortDescription: string | null;
  price: number;
  mrp: number;
};

export const labPrescriptionsApi = {
  list: () => request<LabPrescription[]>("/lab/prescriptions", labAuthed()),
  get: (id: string) => request<LabPrescription>(`/lab/prescriptions/${id}`, labAuthed()),
  searchableCatalogue: () => request<LabSearchableCatalogueItem[]>("/lab/prescriptions/catalogue/searchable", labAuthed()),
  recommend: (id: string, items: { itemType: "PARAMETER" | "PROFILE" | "PACKAGE"; itemId: string; available?: boolean; unavailableNote?: string }[]) =>
    request<LabPrescription>(`/lab/prescriptions/${id}/recommended-tests`, labAuthed({ method: "PUT", body: JSON.stringify({ items }) })),
  requestClarification: (id: string, note: string) =>
    request<LabPrescription>(`/lab/prescriptions/${id}/action-required`, labAuthed({ method: "PATCH", body: JSON.stringify({ note }) })),
};
