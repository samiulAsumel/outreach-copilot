// Thin typed wrapper around fetch() for /api/v1/*. Unwraps the
// {success, data, message} / {success, error, message, details} envelope
// (worker/lib/http.ts) so components never touch the envelope shape
// directly — they either get data back or catch an ApiError.
import type { ResumeProfile, Lead, OutreachLogEntry, Tone, Channel, AnalyticsSummary } from '../types';

export class ApiError extends Error {
  readonly code: string;
  readonly details: unknown[];
  readonly status: number;

  constructor(message: string, code: string, status: number, details: unknown[]) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

interface SuccessEnvelope<T> {
  success: true;
  data: T;
  message: string;
}

interface ErrorEnvelope {
  success: false;
  error: string;
  message: string;
  details: unknown[];
}

// The frontend (Cloudflare Pages) and the API (a separate Worker) run on
// different origins in production, so requests need an absolute base URL
// there. Locally, vite.config.ts's dev-server proxy makes /api relative
// paths work against `wrangler dev` on the same origin, so the default
// (unset -> '') is correct for `npm run dev`. Set at build time via
// VITE_API_BASE_URL for the production build (see README "Deploying").
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

// Session token lives in localStorage, not a cookie — the frontend and API
// are different registrable domains in production, so a cookie set by the
// API would be third-party and increasingly blocked by default. Kept out of
// component state entirely: components never see the token, only whether
// they're logged in (see App.tsx's session check on load).
const TOKEN_STORAGE_KEY = 'outreach_copilot_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

function setToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

// App.tsx registers this once on mount so any request anywhere that comes
// back 401 (expired token, wrong password rotated, etc.) bounces the whole
// app back to the login screen — not just the one component that happened
// to make the call.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function unwrap<T>(res: Response): Promise<T> {
  if (res.status === 204) {
    return undefined as T;
  }
  const body = (await res.json()) as SuccessEnvelope<T> | ErrorEnvelope;
  if (!body.success) {
    if (res.status === 401) {
      clearToken();
      onUnauthorized?.();
    }
    throw new ApiError(body.message, body.error, res.status, body.details);
  }
  return body.data;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...init?.headers },
  });
  return unwrap<T>(res);
}

// Separate from request(): a FormData body must NOT get an explicit
// Content-Type set by us — the browser sets it (multipart/form-data with the
// correct boundary) only when it constructs the request itself.
async function requestForm<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, { method: 'POST', body: form, headers: authHeaders() });
  return unwrap<T>(res);
}

// Filename is parsed from Content-Disposition (worker/routes/profile.ts sets
// `attachment; filename="..."`) rather than trusted from local state, so the
// downloaded file is always named after what the server actually sent.
const CONTENT_DISPOSITION_FILENAME_RE = /filename="([^"]+)"/;

// A plain <a href> can't carry an Authorization header, and CV download now
// sits behind the same auth gate as everything else — so this fetches the
// bytes as an authenticated request and hands the browser a client-side
// Blob URL to save, instead of navigating to the API URL directly.
async function downloadCv(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/v1/profile/cv`, { headers: authHeaders() });
  if (!res.ok) {
    if (res.status === 401) {
      clearToken();
      onUnauthorized?.();
    }
    const body = (await res.json().catch(() => null)) as ErrorEnvelope | null;
    throw new ApiError(body?.message ?? 'Failed to download CV', body?.error ?? 'DOWNLOAD_FAILED', res.status, body?.details ?? []);
  }
  const filename = CONTENT_DISPOSITION_FILENAME_RE.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'cv';
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export const api = {
  login: async (password: string) => {
    const { token } = await request<{ token: string }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    setToken(token);
  },
  logout: clearToken,
  // Resolves true only if a token exists and the server still accepts it —
  // used on app load to decide whether to show the dashboard or the login
  // screen, without ever exposing "why not" (expired vs. never logged in)
  // to the caller.
  checkSession: async (): Promise<boolean> => {
    if (!getToken()) return false;
    try {
      await request<{ valid: true }>('/api/v1/auth/session');
      return true;
    } catch {
      return false;
    }
  },

  getProfile: () => request<ResumeProfile>('/api/v1/profile'),
  saveProfile: (content_text: string, portfolio_link: string | null) =>
    request<ResumeProfile>('/api/v1/profile', {
      method: 'PUT',
      body: JSON.stringify({ content_text, portfolio_link }),
    }),
  uploadCv: (file: File) => {
    const form = new FormData();
    form.set('file', file);
    return requestForm<ResumeProfile>('/api/v1/profile/cv', form);
  },
  downloadCv,
  deleteCv: () => request<void>('/api/v1/profile/cv', { method: 'DELETE' }),

  listLeads: () => request<Lead[]>('/api/v1/leads'),
  createLead: (input: {
    company_name: string;
    url: string;
    contact_name?: string;
    contact_email?: string;
    linkedin_url?: string;
    whatsapp_number?: string;
  }) => request<Lead>('/api/v1/leads', { method: 'POST', body: JSON.stringify(input) }),
  updateLead: (id: number, patch: { status?: string; replied?: boolean; linkedin_status?: string }) =>
    request<Lead>(`/api/v1/leads/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteLead: (id: number) => request<void>(`/api/v1/leads/${id}`, { method: 'DELETE' }),

  generateDraft: (leadId: number, tone: Tone, channel: Channel) =>
    request<OutreachLogEntry>(`/api/v1/leads/${leadId}/draft`, { method: 'POST', body: JSON.stringify({ tone, channel }) }),
  markSent: (leadId: number, final_sent_text: string, channel: Channel) =>
    request<OutreachLogEntry>(`/api/v1/leads/${leadId}/sent`, {
      method: 'POST',
      body: JSON.stringify({ final_sent_text, channel }),
    }),
  getLeadHistory: (leadId: number) => request<OutreachLogEntry[]>(`/api/v1/leads/${leadId}/history`),

  getUsage: () => request<{ drafts_today: number }>('/api/v1/usage'),
  getAnalytics: () => request<AnalyticsSummary>('/api/v1/analytics'),
};
