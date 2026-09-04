import { ApiError } from "@/lib/api";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

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
