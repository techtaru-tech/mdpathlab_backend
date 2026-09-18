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

export type DashboardRecentOrder = {
  id: string;
  orderNumber: string;
  status: AdminOrderStatus;
  total: number;
  paymentMethod: "ONLINE" | "COD";
  createdAt: string;
  patientName: string | null;
  patientPhone: string;
};

export type DashboardSummary = {
  totalPatients: number;
  newPatientsThisWeek: number;
  totalOrders: number;
  todaysBookings: number;
  pendingAssignment: number;
  pendingReportsApproval: number;
  revenueCollected: number;
  revenueThisMonth: number;
  ordersByStatus: Record<string, number>;
  paymentMethodBreakdown: Record<string, number>;
  collectionTypeBreakdown: Record<string, number>;
  recentOrders: DashboardRecentOrder[];
  revenueTrend: { date: string; amount: number }[];
};

export type AdminAlerts = { pendingAssignment: number; pendingReportsApproval: number };

export const adminDashboardApi = {
  summary: () => request<DashboardSummary>("/admin/dashboard/summary", adminAuthed()),
  alerts: () => request<AdminAlerts>("/admin/dashboard/alerts", adminAuthed()),
};

export type AdminPatient = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  status: "ACTIVE" | "INACTIVE";
  walletBalance: number;
  createdAt: string;
  _count: { familyMembers: number; orders: number };
};

export type CreatePatientInput = {
  phone: string;
  name?: string;
  email?: string;
  gender?: "MALE" | "FEMALE" | "OTHER";
  dob?: string;
  city?: string;
};

export const adminPatientsApi = {
  list: (search?: string) =>
    request<AdminPatient[]>(`/admin/patients${search ? `?search=${encodeURIComponent(search)}` : ""}`, adminAuthed()),
  create: (dto: CreatePatientInput) => request<AdminPatient>("/admin/patients", adminAuthed({ method: "POST", body: JSON.stringify(dto) })),
  updateStatus: (id: string, status: "ACTIVE" | "INACTIVE") =>
    request<AdminPatient>(`/admin/patients/${id}/status`, adminAuthed({ method: "PATCH", body: JSON.stringify({ status }) })),
  creditWallet: (id: string, amount: number, reason: string) =>
    request<{ balance: number }>(`/admin/patients/${id}/wallet/credit`, adminAuthed({ method: "POST", body: JSON.stringify({ amount, reason }) })),
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

// One row per OrderItem — the historical price/mrp/name snapshot taken at checkout, never
// re-resolved against the live catalogue. `familyMemberId` is the raw FK; the backend's
// admin-detail query doesn't currently include the nested `familyMember` relation, so the name
// isn't available here (see admin.bookings.$orderId.tsx's handling of this).
export type AdminOrderItem = {
  id: string;
  itemType: "PARAMETER" | "PROFILE" | "PACKAGE";
  itemId: string;
  itemName: string;
  mrp: number;
  price: number;
  familyMemberId: string | null;
};

export type AdminOrderStatusLog = {
  id: string;
  status: AdminOrderStatus;
  note: string | null;
  changedBy: string | null;
  createdAt: string;
};

export type AdminOrderAddress = {
  id: string;
  label: string | null;
  houseNo: string | null;
  line1: string;
  landmark: string | null;
  city: string;
  state: string | null;
  pincode: string;
  phone: string | null;
};

export type AdminOrder = {
  id: string;
  orderNumber: string;
  status: AdminOrderStatus;
  paymentStatus: string;
  paymentMethod: "ONLINE" | "COD";
  collectionType: "HOME" | "CENTER";
  subtotal: number;
  discount: number;
  collectionFee: number;
  total: number;
  // Real columns on Order, but the admin detail query doesn't include the `collectionCenter`/
  // `coupon` relations (only `list()`'s address/slot/phlebotomist are resolved) — these stay as
  // raw ids until that's addressed; see this page's handling and the implementation report.
  collectionCenterId: string | null;
  couponId: string | null;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  // Pay-at-Collection payment recording (FSD §2.4) — set by the phlebotomist payment-collection
  // endpoint; null until then, and only ever applicable to paymentMethod: "COD" bookings.
  collectedAmount: number | null;
  collectionPaymentMode: "CASH" | "UPI" | null;
  collectedAt: string | null;
  scheduledDate: string | null;
  createdAt: string;
  user: { id: string; phone: string; name: string | null };
  items: AdminOrderItem[];
  slot: { id: string; label: string; startTime: string; endTime: string } | null;
  address: AdminOrderAddress | null;
  phlebotomist: { id: string; user: { name: string | null; phone: string } } | null;
  reports: AdminReport[];
  // Only present on the single-order detail response (GET /admin/orders/:id), not on list().
  statusLogs?: AdminOrderStatusLog[];
};

export const adminOrdersApi = {
  list: (status?: string) => request<AdminOrder[]>(`/admin/orders${status ? `?status=${status}` : ""}`, adminAuthed()),
  get: (id: string) => request<AdminOrder>(`/admin/orders/${id}`, adminAuthed()),
  updateStatus: (id: string, dto: { status: AdminOrderStatus; note?: string; phlebotomistId?: string }) =>
    request<AdminOrder>(`/admin/orders/${id}/status`, adminAuthed({ method: "PATCH", body: JSON.stringify(dto) })),
  cancel: (id: string, reason: string) =>
    request<AdminOrder>(`/admin/orders/${id}/cancel`, adminAuthed({ method: "POST", body: JSON.stringify({ reason }) })),
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
  completedCollections: number;
};

export const adminPhlebotomistsApi = {
  list: () => request<AdminPhlebotomist[]>("/admin/phlebotomists", adminAuthed()),
  create: (dto: { phone: string; name: string; employeeCode: string; vehicleType?: string; vehicleNumber?: string; coverageCity?: string }) =>
    request<AdminPhlebotomist>("/admin/phlebotomists", adminAuthed({ method: "POST", body: JSON.stringify(dto) })),
  updateStatus: (id: string, status: "ACTIVE" | "INACTIVE" | "ON_LEAVE") =>
    request<AdminPhlebotomist>(`/admin/phlebotomists/${id}`, adminAuthed({ method: "PATCH", body: JSON.stringify({ status }) })),
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
  updateStatus: (id: string, status: "ACTIVE" | "INACTIVE") =>
    request<AdminCollectionCenter>(`/admin/collection-centers/${id}`, adminAuthed({ method: "PATCH", body: JSON.stringify({ status }) })),
};

export type AdminOffer = {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  ctaLabel: string;
  ctaLink: string | null;
  sortOrder: number;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
};

export type OfferInput = {
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaLink?: string;
  sortOrder?: number;
  status?: "ACTIVE" | "INACTIVE";
  image?: File;
};

function offerFormData(dto: OfferInput): FormData {
  const form = new FormData();
  form.append("title", dto.title);
  if (dto.subtitle) form.append("subtitle", dto.subtitle);
  if (dto.ctaLabel) form.append("ctaLabel", dto.ctaLabel);
  if (dto.ctaLink) form.append("ctaLink", dto.ctaLink);
  if (dto.sortOrder !== undefined) form.append("sortOrder", String(dto.sortOrder));
  if (dto.status) form.append("status", dto.status);
  if (dto.image) form.append("image", dto.image);
  return form;
}

async function uploadRequest<T>(path: string, method: "POST" | "PATCH", form: FormData): Promise<T> {
  const token = adminSession.getToken();
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = body?.message ?? "Something went wrong — please try again";
    throw new AdminApiError(Array.isArray(message) ? message[0] : message, res.status);
  }
  return body as T;
}

export const adminOffersApi = {
  list: () => request<AdminOffer[]>("/admin/offers", adminAuthed()),
  create: (dto: OfferInput & { image: File }) => uploadRequest<AdminOffer>("/admin/offers", "POST", offerFormData(dto)),
  update: (id: string, dto: OfferInput) => uploadRequest<AdminOffer>(`/admin/offers/${id}`, "PATCH", offerFormData(dto)),
  remove: (id: string) => request<{ ok: boolean }>(`/admin/offers/${id}`, adminAuthed({ method: "DELETE" })),
};

export type AdminBlogPost = {
  id: string;
  title: string;
  slug: string;
  category: string;
  excerpt: string;
  content: string;
  coverImageUrl: string;
  readTimeMinutes: number;
  status: "DRAFT" | "PUBLISHED";
  publishedAt: string | null;
  createdAt: string;
};

export type BlogPostInput = {
  title: string;
  slug?: string;
  category: string;
  excerpt: string;
  content: string;
  readTimeMinutes?: number;
  status?: "DRAFT" | "PUBLISHED";
  image?: File;
};

function blogPostFormData(dto: BlogPostInput): FormData {
  const form = new FormData();
  form.append("title", dto.title);
  if (dto.slug) form.append("slug", dto.slug);
  form.append("category", dto.category);
  form.append("excerpt", dto.excerpt);
  form.append("content", dto.content);
  if (dto.readTimeMinutes !== undefined) form.append("readTimeMinutes", String(dto.readTimeMinutes));
  if (dto.status) form.append("status", dto.status);
  if (dto.image) form.append("image", dto.image);
  return form;
}

export const adminBlogApi = {
  list: () => request<AdminBlogPost[]>("/admin/blog", adminAuthed()),
  create: (dto: BlogPostInput & { image: File }) => uploadRequest<AdminBlogPost>("/admin/blog", "POST", blogPostFormData(dto)),
  update: (id: string, dto: BlogPostInput) => uploadRequest<AdminBlogPost>(`/admin/blog/${id}`, "PATCH", blogPostFormData(dto)),
  remove: (id: string) => request<{ ok: boolean }>(`/admin/blog/${id}`, adminAuthed({ method: "DELETE" })),
};

export type AdminSiteSettings = {
  id: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  bannerUrl: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  appStoreUrl: string | null;
  playStoreUrl: string | null;
  razorpayKeyId: string | null;
  razorpayKeySecret: string | null;
  razorpayWebhookSecret: string | null;
  onlinePaymentEnabled: boolean;
  codEnabled: boolean;
  privacyPolicyContent: string | null;
  termsConditionsContent: string | null;
  updatedAt: string;
};

export type SiteSettingsInput = {
  address?: string;
  email?: string;
  phone?: string;
  appStoreUrl?: string;
  playStoreUrl?: string;
  privacyPolicyContent?: string;
  termsConditionsContent?: string;
  razorpayKeyId?: string;
  razorpayKeySecret?: string;
  razorpayWebhookSecret?: string;
  onlinePaymentEnabled?: boolean;
  codEnabled?: boolean;
  logo?: File;
  favicon?: File;
  banner?: File;
};

function siteSettingsFormData(dto: SiteSettingsInput): FormData {
  const form = new FormData();
  const stringFields: (keyof SiteSettingsInput)[] = [
    "address",
    "email",
    "phone",
    "appStoreUrl",
    "playStoreUrl",
    "privacyPolicyContent",
    "termsConditionsContent",
    "razorpayKeyId",
    "razorpayKeySecret",
    "razorpayWebhookSecret",
  ];
  for (const key of stringFields) {
    const value = dto[key];
    if (value !== undefined) form.append(key, value as string);
  }
  if (dto.onlinePaymentEnabled !== undefined) form.append("onlinePaymentEnabled", String(dto.onlinePaymentEnabled));
  if (dto.codEnabled !== undefined) form.append("codEnabled", String(dto.codEnabled));
  if (dto.logo) form.append("logo", dto.logo);
  if (dto.favicon) form.append("favicon", dto.favicon);
  if (dto.banner) form.append("banner", dto.banner);
  return form;
}

export const adminSettingsApi = {
  get: () => request<AdminSiteSettings>("/admin/settings", adminAuthed()),
  update: (dto: SiteSettingsInput) => uploadRequest<AdminSiteSettings>("/admin/settings", "PATCH", siteSettingsFormData(dto)),
};

export type AdminSlot = {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
  sortOrder: number;
};

export type SlotInput = {
  label: string;
  startTime: string;
  endTime: string;
  sortOrder?: number;
  isActive?: boolean;
};

export const adminSlotsApi = {
  list: () => request<AdminSlot[]>("/admin/slots", adminAuthed()),
  create: (dto: SlotInput) => request<AdminSlot>("/admin/slots", adminAuthed({ method: "POST", body: JSON.stringify(dto) })),
  update: (id: string, dto: Partial<SlotInput>) =>
    request<AdminSlot>(`/admin/slots/${id}`, adminAuthed({ method: "PATCH", body: JSON.stringify(dto) })),
  remove: (id: string) => request<{ ok: boolean }>(`/admin/slots/${id}`, adminAuthed({ method: "DELETE" })),
};

export type AdminSlotAvailability = {
  id: string;
  slotId: string;
  slotLabel: string;
  startTime: string;
  endTime: string;
  date: string;
  collectionType: "HOME" | "CENTER" | null;
  collectionCenterId: string | null;
  collectionCenterName: string | null;
  scopeLabel: string;
  fallbackNote: string | null;
  capacity: number;
  booked: number;
  remaining: number;
  available: boolean;
};

export type SlotAvailabilityInput = {
  slotId: string;
  date: string;
  collectionType?: "HOME" | "CENTER";
  collectionCenterId?: string;
  capacity: number;
};

export const adminSlotAvailabilityApi = {
  list: (filters?: { date?: string; collectionType?: "HOME" | "CENTER"; collectionCenterId?: string; slotId?: string }) => {
    const query = new URLSearchParams();
    if (filters?.date) query.set("date", filters.date);
    if (filters?.collectionType) query.set("collectionType", filters.collectionType);
    if (filters?.collectionCenterId) query.set("collectionCenterId", filters.collectionCenterId);
    if (filters?.slotId) query.set("slotId", filters.slotId);
    const qs = query.toString();
    return request<AdminSlotAvailability[]>(`/admin/slot-availability${qs ? `?${qs}` : ""}`, adminAuthed());
  },
  create: (dto: SlotAvailabilityInput) => request<AdminSlotAvailability>("/admin/slot-availability", adminAuthed({ method: "POST", body: JSON.stringify(dto) })),
  update: (id: string, capacity: number) =>
    request<AdminSlotAvailability>(`/admin/slot-availability/${id}`, adminAuthed({ method: "PATCH", body: JSON.stringify({ capacity }) })),
  remove: (id: string) => request<{ deleted: boolean }>(`/admin/slot-availability/${id}`, adminAuthed({ method: "DELETE" })),
};

// ---------- Diagnostic catalogue: Categories / Parameters / Tests (Profiles) / Packages ----------

export type AdminCategory = { id: string; name: string; slug: string; status: "ACTIVE" | "INACTIVE" };

export const adminCategoriesApi = {
  list: () => request<AdminCategory[]>("/admin/categories", adminAuthed()),
  create: (dto: { name: string; slug?: string; status?: "ACTIVE" | "INACTIVE" }) =>
    request<AdminCategory>("/admin/categories", adminAuthed({ method: "POST", body: JSON.stringify(dto) })),
  update: (id: string, dto: { name: string; slug?: string; status?: "ACTIVE" | "INACTIVE" }) =>
    request<AdminCategory>(`/admin/categories/${id}`, adminAuthed({ method: "PATCH", body: JSON.stringify(dto) })),
  remove: (id: string) => request<{ deleted: boolean }>(`/admin/categories/${id}`, adminAuthed({ method: "DELETE" })),
};

export type AdminParameter = {
  id: string;
  name: string;
  code: string | null;
  slug: string;
  shortDescription: string | null;
  mrp: number;
  price: number;
  sampleCollection: "HOME" | "LAB" | "BOTH";
  sampleCollectionFee: number;
  reportTimeHours: number;
  fastingRequired: boolean;
  fastingHours: number | null;
  categoryId: string | null;
  category: AdminCategory | null;
  status: "ACTIVE" | "INACTIVE";
  tag: string | null;
  displayParameterCount: number | null;
};

export type ParameterFormDto = {
  name: string;
  code?: string | null | undefined;
  slug?: string | undefined;
  categoryId?: string | null | undefined;
  shortDescription?: string | null | undefined;
  mrp: number;
  price: number;
  sampleCollection?: "HOME" | "LAB" | "BOTH" | undefined;
  sampleCollectionFee?: number | undefined;
  reportTimeHours: number;
  fastingRequired?: boolean | undefined;
  fastingHours?: number | null | undefined;
  status?: "ACTIVE" | "INACTIVE" | undefined;
  tag?: string | null | undefined;
  displayParameterCount?: number | undefined;
};

export type CsvRowError = { row: number; errors: string[] };
export type CsvPreview = { totalRows: number; willCreate: number; willUpdate: number; invalid: number; rows: { row: number; action: string; errors: string[] }[] };
export type CsvImportResult = { created: number; updated: number; failed: number; rowErrors: CsvRowError[] };

async function downloadAuthed(path: string, filename: string) {
  const token = adminSession.getToken();
  const res = await fetch(`${API_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new AdminApiError("Couldn't download file", res.status);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function uploadCsv<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  const token = adminSession.getToken();
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new AdminApiError(body?.message ?? "CSV upload failed", res.status);
  return body as T;
}

function toQuery(params: Record<string, string | undefined>) {
  const entries = Object.entries(params).filter(([, v]) => v);
  return entries.length ? `?${new URLSearchParams(entries as [string, string][]).toString()}` : "";
}

export const adminParametersApi = {
  list: (params?: { search?: string; status?: string; categoryId?: string }) =>
    request<AdminParameter[]>(`/admin/parameters${toQuery(params ?? {})}`, adminAuthed()),
  create: (dto: ParameterFormDto) => request<AdminParameter>("/admin/parameters", adminAuthed({ method: "POST", body: JSON.stringify(dto) })),
  update: (id: string, dto: ParameterFormDto) =>
    request<AdminParameter>(`/admin/parameters/${id}`, adminAuthed({ method: "PATCH", body: JSON.stringify(dto) })),
  setStatus: (id: string, status: "ACTIVE" | "INACTIVE") =>
    request<AdminParameter>(`/admin/parameters/${id}/status`, adminAuthed({ method: "PATCH", body: JSON.stringify({ status }) })),
  remove: (id: string) => request<{ deleted: boolean }>(`/admin/parameters/${id}`, adminAuthed({ method: "DELETE" })),
  downloadTemplate: () => downloadAuthed("/admin/parameters/csv/template", "parameters-template.csv"),
  downloadExport: () => downloadAuthed("/admin/parameters/csv/export", "parameters-export.csv"),
  previewCsv: (file: File) => uploadCsv<CsvPreview>("/admin/parameters/csv/preview", file),
  importCsv: (file: File) => uploadCsv<CsvImportResult>("/admin/parameters/csv/import", file),
};

export type AdminProfileParameter = { parameterId: string; parameter: AdminParameter };

export type AdminTest = {
  id: string;
  testCode: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  sampleType: string | null;
  preparationInstructions: string | null;
  mrp: number;
  price: number;
  sampleCollection: "HOME" | "LAB" | "BOTH";
  reportTimeHours: number;
  fastingRequired: boolean;
  fastingHours: number | null;
  categoryId: string | null;
  category: AdminCategory | null;
  status: "ACTIVE" | "INACTIVE";
  tag: string | null;
  parameters: AdminProfileParameter[];
};

export type TestFormDto = {
  testCode: string;
  name: string;
  slug?: string | undefined;
  categoryId?: string | null | undefined;
  shortDescription?: string | null | undefined;
  sampleType?: string | null | undefined;
  preparationInstructions?: string | null | undefined;
  mrp: number;
  price: number;
  sampleCollection?: "HOME" | "LAB" | "BOTH" | undefined;
  reportTimeHours: number;
  fastingRequired?: boolean | undefined;
  fastingHours?: number | null | undefined;
  status?: "ACTIVE" | "INACTIVE" | undefined;
  tag?: string | null | undefined;
  parameterIds?: string[] | undefined;
};

export const adminTestsApi = {
  list: (params?: { search?: string; status?: string; categoryId?: string }) =>
    request<AdminTest[]>(`/admin/tests${toQuery(params ?? {})}`, adminAuthed()),
  create: (dto: TestFormDto) => request<AdminTest>("/admin/tests", adminAuthed({ method: "POST", body: JSON.stringify(dto) })),
  update: (id: string, dto: TestFormDto) => request<AdminTest>(`/admin/tests/${id}`, adminAuthed({ method: "PATCH", body: JSON.stringify(dto) })),
  setStatus: (id: string, status: "ACTIVE" | "INACTIVE") =>
    request<AdminTest>(`/admin/tests/${id}/status`, adminAuthed({ method: "PATCH", body: JSON.stringify({ status }) })),
  remove: (id: string) => request<{ deleted: boolean }>(`/admin/tests/${id}`, adminAuthed({ method: "DELETE" })),
  downloadTemplate: () => downloadAuthed("/admin/tests/csv/template", "tests-template.csv"),
  downloadExport: () => downloadAuthed("/admin/tests/csv/export", "tests-export.csv"),
  previewCsv: (file: File) => uploadCsv<CsvPreview>("/admin/tests/csv/preview", file),
  importCsv: (file: File) => uploadCsv<CsvImportResult>("/admin/tests/csv/import", file),
};

export type AdminPackageItem = { itemType: "PARAMETER" | "PROFILE"; parameter: AdminParameter | null; profile: AdminTest | null };

export type AdminPackage = {
  id: string;
  name: string;
  slug: string;
  subtitle: string | null;
  mrp: number;
  price: number;
  reportTimeHours: number;
  fastingRequired: boolean;
  fastingHours: number | null;
  bestFor: string | null;
  badge: string | null;
  highlights: string[];
  isFeatured: boolean;
  status: "ACTIVE" | "INACTIVE";
  items: AdminPackageItem[];
};

export type PackageFormDto = {
  name: string;
  slug?: string | undefined;
  subtitle?: string | null | undefined;
  mrp: number;
  price: number;
  reportTimeHours: number;
  fastingRequired?: boolean | undefined;
  fastingHours?: number | null | undefined;
  bestFor?: string | null | undefined;
  badge?: string | null | undefined;
  highlights?: string[] | undefined;
  isFeatured?: boolean | undefined;
  status?: "ACTIVE" | "INACTIVE" | undefined;
  items?: { itemType: "PARAMETER" | "PROFILE"; itemId: string }[] | undefined;
};

export const adminPackagesApi = {
  list: (params?: { search?: string; status?: string; featured?: string }) =>
    request<AdminPackage[]>(`/admin/packages${toQuery(params ?? {})}`, adminAuthed()),
  create: (dto: PackageFormDto) => request<AdminPackage>("/admin/packages", adminAuthed({ method: "POST", body: JSON.stringify(dto) })),
  update: (id: string, dto: PackageFormDto) => request<AdminPackage>(`/admin/packages/${id}`, adminAuthed({ method: "PATCH", body: JSON.stringify(dto) })),
  setStatus: (id: string, status: "ACTIVE" | "INACTIVE") =>
    request<AdminPackage>(`/admin/packages/${id}/status`, adminAuthed({ method: "PATCH", body: JSON.stringify({ status }) })),
  remove: (id: string) => request<{ deleted: boolean }>(`/admin/packages/${id}`, adminAuthed({ method: "DELETE" })),
};

export type AdminContactQuery = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  message: string;
  status: "NEW" | "CONTACTED";
  createdAt: string;
};

export const adminContactQueriesApi = {
  list: () => request<AdminContactQuery[]>("/admin/contact-queries", adminAuthed()),
  updateStatus: (id: string, status: "NEW" | "CONTACTED") =>
    request<AdminContactQuery>(`/admin/contact-queries/${id}`, adminAuthed({ method: "PATCH", body: JSON.stringify({ status }) })),
};

export type AdminCity = { id: string; name: string; slug: string; isActive: boolean };

export type CityInput = { name: string; slug?: string; isActive?: boolean };

export const adminCitiesApi = {
  list: () => request<AdminCity[]>("/admin/cities", adminAuthed()),
  create: (dto: CityInput) => request<AdminCity>("/admin/cities", adminAuthed({ method: "POST", body: JSON.stringify(dto) })),
  update: (id: string, dto: CityInput) => request<AdminCity>(`/admin/cities/${id}`, adminAuthed({ method: "PATCH", body: JSON.stringify(dto) })),
  remove: (id: string) => request<{ deleted: boolean }>(`/admin/cities/${id}`, adminAuthed({ method: "DELETE" })),
};

export type AdminCallbackRequest = {
  id: string;
  phone: string;
  status: "NEW" | "CONTACTED";
  createdAt: string;
};

export const adminCallbackRequestsApi = {
  list: () => request<AdminCallbackRequest[]>("/admin/callback-requests", adminAuthed()),
  updateStatus: (id: string, status: "NEW" | "CONTACTED") =>
    request<AdminCallbackRequest>(`/admin/callback-requests/${id}`, adminAuthed({ method: "PATCH", body: JSON.stringify({ status }) })),
};

export type AdminPrescription = {
  id: string;
  fileUrl: string;
  note: string | null;
  status: "PENDING" | "REVIEWED";
  adminNote: string | null;
  createdAt: string;
  user: { name: string | null; phone: string };
  order: { id: string } | null;
};

export const adminPrescriptionsApi = {
  list: () => request<AdminPrescription[]>("/admin/prescriptions", adminAuthed()),
  updateStatus: (id: string, status: "PENDING" | "REVIEWED", adminNote?: string) =>
    request<AdminPrescription>(
      `/admin/prescriptions/${id}`,
      adminAuthed({ method: "PATCH", body: JSON.stringify({ status, ...(adminNote !== undefined ? { adminNote } : {}) }) }),
    ),
};

export type AdminCoupon = {
  id: string;
  code: string;
  type: "PERCENT" | "FLAT";
  value: number;
  minOrderValue: number | null;
  maxDiscount: number | null;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  usedCount: number;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
};

export type CouponInput = {
  code: string;
  type: "PERCENT" | "FLAT";
  value: number;
  minOrderValue?: number | null;
  maxDiscount?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  usageLimit?: number | null;
  perUserLimit?: number | null;
  status?: "ACTIVE" | "INACTIVE";
};

export const adminCouponsApi = {
  list: () => request<AdminCoupon[]>("/admin/coupons", adminAuthed()),
  create: (dto: CouponInput) => request<AdminCoupon>("/admin/coupons", adminAuthed({ method: "POST", body: JSON.stringify(dto) })),
  update: (id: string, dto: Partial<CouponInput>) =>
    request<AdminCoupon>(`/admin/coupons/${id}`, adminAuthed({ method: "PATCH", body: JSON.stringify(dto) })),
  remove: (id: string) => request<{ deleted: boolean }>(`/admin/coupons/${id}`, adminAuthed({ method: "DELETE" })),
};

export const adminNotificationsApi = {
  registerDeviceToken: (token: string) =>
    request<{ ok: boolean }>("/admin/notifications/device-token", adminAuthed({ method: "POST", body: JSON.stringify({ token }) })),
};
