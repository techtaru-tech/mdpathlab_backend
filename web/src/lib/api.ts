const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export const apiFileUrl = (path: string) => `${API_URL}${path}`;

export class ApiError extends Error {
  status: number;
  retryAfterSeconds: number | undefined;

  constructor(message: string, status: number, retryAfterSeconds?: number) {
    super(message);
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const message = body?.message ?? "Something went wrong — please try again";
    throw new ApiError(Array.isArray(message) ? message[0] : message, res.status, body?.retryAfterSeconds);
  }

  return body as T;
}

function authed(options?: RequestInit): RequestInit {
  const token = session.getToken();
  return { ...options, headers: { ...options?.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) } };
}

export type AuthUser = {
  id: string;
  phone: string;
  name: string | null;
  role: "PATIENT" | "PHLEBOTOMIST";
  isProfileComplete: boolean;
};

export type Profile = {
  id: string;
  phone: string;
  role: "PATIENT" | "PHLEBOTOMIST";
  name: string | null;
  email: string | null;
  dob: string | null;
  gender: "MALE" | "FEMALE" | "OTHER" | null;
  city: string | null;
};

export const authApi = {
  requestOtp: (phone: string) =>
    request<{ message: string; expiresInSeconds: number; devCode?: string }>("/auth/otp/request", {
      method: "POST",
      body: JSON.stringify({ phone }),
    }),

  verifyOtp: (phone: string, code: string) =>
    request<{ accessToken: string; user: AuthUser }>("/auth/otp/verify", {
      method: "POST",
      body: JSON.stringify({ phone, code }),
    }),

  me: () => request<{ user: Profile }>("/auth/me", authed()),
};

const TOKEN_KEY = "mdpathlabs_token";
const USER_KEY = "mdpathlabs_user";

export const session = {
  save(accessToken: string, user: AuthUser) {
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(TOKEN_KEY);
  },
  getUser(): AuthUser | null {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

export type CatalogueItemType = "PARAMETER" | "PROFILE" | "PACKAGE";

export type CatalogueItem = {
  id: string;
  name: string;
  slug: string;
  price: number;
  mrp: number;
};

export type FamilyMember = {
  id: string;
  name: string;
  relation: string;
  gender: "MALE" | "FEMALE" | "OTHER" | null;
  dob: string | null;
};

export type Address = {
  id: string;
  label: string | null;
  houseNo: string | null;
  line1: string;
  landmark: string | null;
  city: string;
  state: string | null;
  pincode: string;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  isDefault: boolean;
};

export type NewAddressInput = {
  label?: string;
  houseNo?: string;
  line1: string;
  landmark?: string;
  city: string;
  state?: string;
  pincode: string;
  phone?: string;
  isDefault?: boolean;
};

export const patientsApi = {
  listFamilyMembers: () => request<FamilyMember[]>("/patients/me/family-members", authed()),
  addFamilyMember: (dto: { name: string; relation: string; gender?: string; dob?: string }) =>
    request<FamilyMember>("/patients/me/family-members", authed({ method: "POST", body: JSON.stringify(dto) })),

  listAddresses: () => request<Address[]>("/patients/me/addresses", authed()),
  addAddress: (dto: NewAddressInput) =>
    request<Address>("/patients/me/addresses", authed({ method: "POST", body: JSON.stringify(dto) })),
};

export type Slot = {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
  sortOrder: number;
};

export const slotsApi = {
  list: () => request<Slot[]>("/slots"),
};

export type CartItem = {
  id: string;
  itemType: CatalogueItemType;
  itemId: string;
  familyMemberId: string | null;
  catalogueItem: CatalogueItem | null;
};

export const cartApi = {
  list: () => request<{ items: CartItem[]; subtotal: number }>("/cart", authed()),
  add: (dto: { itemType: CatalogueItemType; itemId: string; familyMemberId?: string }) =>
    request<CartItem>("/cart", authed({ method: "POST", body: JSON.stringify(dto) })),
  clear: () => request<{ count: number }>("/cart", authed({ method: "DELETE" })),
};

export const couponsApi = {
  apply: (code: string, subtotal: number) =>
    request<{ discount: number; coupon: { code: string } }>(
      "/coupons/apply",
      authed({ method: "POST", body: JSON.stringify({ code, subtotal }) }),
    ),
};

export type OrderItem = {
  id: string;
  itemType: CatalogueItemType;
  itemId: string;
  itemName: string;
  mrp: number;
  price: number;
  familyMemberId: string | null;
};

export type Order = {
  id: string;
  orderNumber: string;
  status:
    | "PENDING_PAYMENT"
    | "CONFIRMED"
    | "PHLEBOTOMIST_ASSIGNED"
    | "SAMPLE_COLLECTED"
    | "IN_LAB"
    | "REPORT_READY"
    | "CANCELLED";
  paymentStatus: "PENDING" | "PAID" | "FAILED" | "REFUNDED";
  paymentMethod: "ONLINE" | "COD";
  collectionType: "HOME" | "CENTER";
  subtotal: number;
  discount: number;
  collectionFee: number;
  total: number;
  scheduledDate: string | null;
  createdAt: string;
  items: OrderItem[];
  slot: Slot | null;
  address: Address | null;
  reports: { id: string; fileUrl: string; status: string; approvedAt: string | null }[];
};

export const ordersApi = {
  checkout: (dto: {
    collectionType: "HOME" | "CENTER";
    addressId?: string;
    collectionCenterId?: string;
    slotId: string;
    scheduledDate: string;
    couponCode?: string;
    paymentMethod: "ONLINE" | "COD";
    items?: { itemType: "PARAMETER" | "PROFILE" | "PACKAGE"; itemId: string; familyMemberId?: string }[];
  }) => request<Order>("/orders/checkout", authed({ method: "POST", body: JSON.stringify(dto) })),

  list: () => request<Order[]>("/orders", authed()),
  get: (id: string) => request<Order>(`/orders/${id}`, authed()),
  cancel: (id: string) => request<Order>(`/orders/${id}/cancel`, authed({ method: "POST" })),
};

export const paymentsApi = {
  createRazorpayOrder: (orderId: string) =>
    request<{ razorpayOrderId: string; amount: number; currency: string; keyId: string }>(
      `/orders/${orderId}/razorpay/create-order`,
      authed({ method: "POST" }),
    ),
  verify: (orderId: string, dto: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) =>
    request<Order>(`/orders/${orderId}/razorpay/verify`, authed({ method: "POST", body: JSON.stringify(dto) })),
};

export type Offer = {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  ctaLabel: string;
  ctaLink: string | null;
};

export const offersApi = {
  list: () => request<Offer[]>("/offers"),
};
