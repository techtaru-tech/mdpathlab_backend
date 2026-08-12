const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export class AdminApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function adminAuthed(options?: RequestInit): RequestInit {
  const token = adminSession.getToken();
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
    throw new AdminApiError(Array.isArray(message) ? message[0] : message, res.status);
  }
  return body as T;
}

export type AdminProfile = { id: string; email: string; name: string };

const ADMIN_TOKEN_KEY = "mdpathlabs_admin_token";
const ADMIN_KEY = "mdpathlabs_admin";

export const adminSession = {
  save(accessToken: string, admin: AdminProfile) {
    localStorage.setItem(ADMIN_TOKEN_KEY, accessToken);
    localStorage.setItem(ADMIN_KEY, JSON.stringify(admin));
  },
  getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  },
  getAdmin(): AdminProfile | null {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(ADMIN_KEY);
    return raw ? JSON.parse(raw) : null;
  },
  clear() {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_KEY);
  },
};

export const adminAuthApi = {
  login: (email: string, password: string) =>
    request<{ accessToken: string; admin: AdminProfile }>("/admin/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
};

export type DashboardSummary = {
  totalPatients: number;
  todaysBookings: number;
  pendingAssignment: number;
  revenueCollected: number;
  ordersByStatus: Record<string, number>;
};

export const adminDashboardApi = {
  summary: () => request<DashboardSummary>("/admin/dashboard/summary", adminAuthed()),
};

export type AdminPatient = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  _count: { familyMembers: number; orders: number };
};

export const adminPatientsApi = {
  list: (search?: string) =>
    request<AdminPatient[]>(`/admin/patients${search ? `?search=${encodeURIComponent(search)}` : ""}`, adminAuthed()),
  updateStatus: (id: string, status: "ACTIVE" | "INACTIVE") =>
    request<AdminPatient>(`/admin/patients/${id}/status`, adminAuthed({ method: "PATCH", body: JSON.stringify({ status }) })),
};

export type AdminOrderStatus =
  | "PENDING_PAYMENT"
  | "CONFIRMED"
  | "PHLEBOTOMIST_ASSIGNED"
  | "SAMPLE_COLLECTED"
  | "IN_LAB"
  | "REPORT_READY"
  | "CANCELLED";

export type AdminReport = {
  id: string;
  fileUrl: string;
  status: "PENDING" | "UPLOADED" | "APPROVED";
  uploadedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
};

export type AdminOrder = {
  id: string;
  orderNumber: string;
  status: AdminOrderStatus;
  paymentStatus: string;
  paymentMethod: "ONLINE" | "COD";
  total: number;
  scheduledDate: string | null;
  createdAt: string;
  user: { id: string; phone: string; name: string | null };
  items: { itemName: string }[];
  slot: { label: string } | null;
  address: { line1: string; city: string } | null;
  phlebotomist: { id: string; user: { name: string | null; phone: string } } | null;
  reports: AdminReport[];
};

export const adminOrdersApi = {
  list: (status?: string) => request<AdminOrder[]>(`/admin/orders${status ? `?status=${status}` : ""}`, adminAuthed()),
  updateStatus: (id: string, dto: { status: AdminOrderStatus; note?: string; phlebotomistId?: string }) =>
    request<AdminOrder>(`/admin/orders/${id}/status`, adminAuthed({ method: "PATCH", body: JSON.stringify(dto) })),
};

export const adminReportsApi = {
  async upload(orderId: string, file: File): Promise<AdminReport> {
    const form = new FormData();
    form.append("file", file);
    const token = adminSession.getToken();
    const res = await fetch(`${API_URL}/admin/orders/${orderId}/reports`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new AdminApiError(body?.message ?? "Upload failed", res.status);
    return body;
  },

  approve: (reportId: string) => request<AdminReport>(`/admin/reports/${reportId}/approve`, adminAuthed({ method: "POST" })),
};

export type AdminPhlebotomist = {
  id: string;
  employeeCode: string;
  vehicleType: string | null;
  vehicleNumber: string | null;
  coverageCity: string | null;
  status: "ACTIVE" | "INACTIVE" | "ON_LEAVE";
  user: { name: string | null; phone: string };
};

export const adminPhlebotomistsApi = {
  list: () => request<AdminPhlebotomist[]>("/admin/phlebotomists", adminAuthed()),
  create: (dto: { phone: string; name: string; employeeCode: string; vehicleType?: string; vehicleNumber?: string; coverageCity?: string }) =>
    request<AdminPhlebotomist>("/admin/phlebotomists", adminAuthed({ method: "POST", body: JSON.stringify(dto) })),
};

export type AdminCollectionCenter = {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  status: "ACTIVE" | "INACTIVE";
};

export const adminCollectionCentersApi = {
  list: () => request<AdminCollectionCenter[]>("/admin/collection-centers", adminAuthed()),
  create: (dto: { name: string; address: string; phone?: string }) =>
    request<AdminCollectionCenter>("/admin/collection-centers", adminAuthed({ method: "POST", body: JSON.stringify(dto) })),
};
