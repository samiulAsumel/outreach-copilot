// Thin typed wrapper around fetch() for /api/v1/*. Unwraps the
// {success, data, message} / {success, error, message, details} envelope
// (worker/lib/http.ts) so components never touch the envelope shape
// directly — they either get data back or catch an ApiError.
import type { ResumeProfile, Lead, EmailLogEntry, Tone } from '../types';

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

async function unwrap<T>(res: Response): Promise<T> {
  if (res.status === 204) {
    return undefined as T;
  }
  const body = (await res.json()) as SuccessEnvelope<T> | ErrorEnvelope;
  if (!body.success) {
    throw new ApiError(body.message, body.error, res.status, body.details);
  }
  return body.data;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  return unwrap<T>(res);
}

// Separate from request(): a FormData body must NOT get an explicit
// Content-Type set by us — the browser sets it (multipart/form-data with the
// correct boundary) only when it constructs the request itself.
async function requestForm<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, { method: 'POST', body: form });
  return unwrap<T>(res);
}

// Absolute URL for the CV download — used directly as an <a href>, not
// fetched: the browser handles the download itself via the Worker's
// Content-Disposition header (worker/routes/profile.ts's handleDownloadCv).
export const cvDownloadUrl = `${API_BASE_URL}/api/v1/profile/cv`;

export const api = {
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
  deleteCv: () => request<void>('/api/v1/profile/cv', { method: 'DELETE' }),

  listLeads: () => request<Lead[]>('/api/v1/leads'),
  createLead: (input: { company_name: string; url: string; contact_name?: string; contact_email?: string }) =>
    request<Lead>('/api/v1/leads', { method: 'POST', body: JSON.stringify(input) }),
  updateLead: (id: number, patch: { status?: string; replied?: boolean }) =>
    request<Lead>(`/api/v1/leads/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteLead: (id: number) => request<void>(`/api/v1/leads/${id}`, { method: 'DELETE' }),

  generateDraft: (leadId: number, tone: Tone) =>
    request<EmailLogEntry>(`/api/v1/leads/${leadId}/draft`, { method: 'POST', body: JSON.stringify({ tone }) }),
  markSent: (leadId: number, final_sent_text: string) =>
    request<EmailLogEntry>(`/api/v1/leads/${leadId}/sent`, {
      method: 'POST',
      body: JSON.stringify({ final_sent_text }),
    }),

  getUsage: () => request<{ drafts_today: number }>('/api/v1/usage'),
};
