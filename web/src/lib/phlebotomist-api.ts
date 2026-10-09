import { handleUnauthorized } from "@/lib/unauthorized";
import { ApiError } from "@/lib/api";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
  if (res.status === 401) handleUnauthorized("phlebotomist", options, () => phlebotomistSession.clear());
    const message = body?.message ?? "Something went wrong — please try again";
    throw new ApiError(Array.isArray(message) ? message[0] : message, res.status, body?.retryAfterSeconds);
  }

  return body as T;
}

export type PhlebotomistProfile = {
  id: string;
  userId: string;
  phone: string;
  name: string | null;
  employeeCode: string;
  status: "ACTIVE" | "INACTIVE" | "ON_LEAVE";
};

export const phlebotomistAuthApi = {
  requestOtp: (phone: string) =>
    request<{ message: string; expiresInSeconds: number; devCode?: string }>("/auth/phlebotomist/otp/request", {
      method: "POST",
      body: JSON.stringify({ phone }),
    }),

  verifyOtp: (phone: string, code: string) =>
    request<{ accessToken: string; phlebotomist: PhlebotomistProfile }>("/auth/phlebotomist/otp/verify", {
      method: "POST",
      body: JSON.stringify({ phone, code }),
    }),
};

const TOKEN_KEY = "mdpathlabs_phlebotomist_token";
const PROFILE_KEY = "mdpathlabs_phlebotomist_profile";

export const phlebotomistSession = {
  save(accessToken: string, phlebotomist: PhlebotomistProfile) {
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(PROFILE_KEY, JSON.stringify(phlebotomist));
  },
  getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(TOKEN_KEY);
  },
  getProfile(): PhlebotomistProfile | null {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PROFILE_KEY);
  },
};

function phlebotomistAuthed(options?: RequestInit): RequestInit {
  const token = phlebotomistSession.getToken();
  return { ...options, headers: { ...options?.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) } };
}

export const phlebotomistNotificationsApi = {
  registerDeviceToken: (token: string) =>
    request<{ ok: boolean }>("/phlebotomist/notifications/device-token", phlebotomistAuthed({ method: "POST", body: JSON.stringify({ token }) })),
};

export type PhlebotomistAssignment = {
  id: string;
  orderNumber: string;
  patientName: string | null;
  address: { line1: string; city: string; pincode: string; landmark: string | null } | null;
  scheduledDate: string | null;
  slot: { label: string } | null;
  status: string;
  phlebotomistStatus: "Pending" | "Collected" | "Handed Over" | "Cancelled";
  assignmentStatus: "PENDING" | "ACCEPTED" | "REJECTED" | null;
  onTheWayAt: string | null;
  reachedAt: string | null;
  collectionOtpVerifiedAt: string | null;
  handedOverAt: string | null;
};

export type PhlebotomistOrderDetail = PhlebotomistAssignment & {
  user: { name: string | null; phone: string };
  paymentMethod: "ONLINE" | "COD";
  collectedAmount: number | null;
  collectionPaymentMode: "CASH" | "UPI" | null;
  sampleBarcode: string | null;
  items: { id: string; itemName: string; price: number; familyMember: { name: string; relation: string } | null }[];
};

export type PhlebotomistSampleRow = {
  orderItemId: string;
  itemName: string;
  sample: { orderItemId: string; tubeType: string | null; quantity: string | null; label: string | null; collectedAt: string | null } | null;
};

export const phlebotomistOrdersApi = {
  listToday: () => request<PhlebotomistAssignment[]>("/phlebotomist/assignments/today", phlebotomistAuthed()),
  get: (id: string) => request<PhlebotomistOrderDetail>(`/phlebotomist/orders/${id}`, phlebotomistAuthed()),
  accept: (id: string) => request<PhlebotomistOrderDetail>(`/phlebotomist/orders/${id}/accept`, phlebotomistAuthed({ method: "POST" })),
  reject: (id: string, reason?: string) =>
    request<{ ok: boolean }>(`/phlebotomist/orders/${id}/reject`, phlebotomistAuthed({ method: "POST", body: JSON.stringify({ ...(reason ? { reason } : {}) }) })),
  onTheWay: (id: string) => request<PhlebotomistOrderDetail>(`/phlebotomist/orders/${id}/on-the-way`, phlebotomistAuthed({ method: "POST" })),
  markReached: (id: string) => request<PhlebotomistOrderDetail>(`/phlebotomist/orders/${id}/reached`, phlebotomistAuthed({ method: "POST" })),
  verifyOtp: (id: string, code: string) =>
    request<PhlebotomistOrderDetail>(`/phlebotomist/orders/${id}/verify-otp`, phlebotomistAuthed({ method: "POST", body: JSON.stringify({ code }) })),
  listSamples: (id: string) => request<PhlebotomistSampleRow[]>(`/phlebotomist/orders/${id}/samples`, phlebotomistAuthed()),
  updateSample: (id: string, orderItemId: string, dto: { tubeType?: string; quantity?: string; label?: string; collected?: boolean }) =>
    request<PhlebotomistSampleRow["sample"]>(`/phlebotomist/orders/${id}/samples/${orderItemId}`, phlebotomistAuthed({ method: "PATCH", body: JSON.stringify(dto) })),
  markSampleCollected: (id: string) => request<PhlebotomistOrderDetail>(`/phlebotomist/orders/${id}/sample-collected`, phlebotomistAuthed({ method: "POST" })),
  collectPayment: (id: string, amount: number, paymentMode: "CASH" | "UPI") =>
    request<PhlebotomistOrderDetail>(`/phlebotomist/orders/${id}/payment`, phlebotomistAuthed({ method: "POST", body: JSON.stringify({ amount, paymentMode }) })),
  handover: (id: string, sampleBarcode: string) =>
    request<PhlebotomistOrderDetail>(`/phlebotomist/orders/${id}/handover`, phlebotomistAuthed({ method: "POST", body: JSON.stringify({ sampleBarcode }) })),
  collectionHistory: () =>
    request<{
      summary: { totalCollections: number; totalCashCollected: number; totalUpiCollected: number };
      history: { date: string; totalCollections: number; totalCashCollected: number; totalUpiCollected: number; collections: unknown[] }[];
    }>("/phlebotomist/collections/history", phlebotomistAuthed()),
};
