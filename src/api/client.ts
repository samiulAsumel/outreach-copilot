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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const body = (await res.json()) as SuccessEnvelope<T> | ErrorEnvelope;
  if (!body.success) {
    throw new ApiError(body.message, body.error, res.status, body.details);
  }
  return body.data;
}

export const api = {
  getProfile: () => request<ResumeProfile>('/api/v1/profile'),
  saveProfile: (content_text: string) =>
    request<ResumeProfile>('/api/v1/profile', { method: 'PUT', body: JSON.stringify({ content_text }) }),

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
