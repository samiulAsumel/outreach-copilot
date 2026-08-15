// Mirrors worker/types.ts DTOs. Kept as a separate copy rather than a
// shared import: the SPA build (tsconfig.json, lib: DOM) and the Worker
// build (worker/tsconfig.json, no DOM) are intentionally isolated project
// boundaries — see the comment in tsconfig.json.
export type LeadStatus = 'new' | 'drafted' | 'sent' | 'replied';
export type Tone = 'formal' | 'casual';

export interface ResumeProfile {
  id: 1;
  content_text: string;
  portfolio_link: string | null;
  cv_file_name: string | null;
  cv_file_uploaded_at: string | null;
  updated_at: string | null;
}

export interface Lead {
  id: number;
  company_name: string;
  url: string;
  contact_name: string | null;
  contact_email: string | null;
  fetched_context: string | null;
  status: LeadStatus;
  created_at: string;
}

export interface EmailLogEntry {
  id: number;
  lead_id: number;
  tone: Tone | null;
  draft_text: string;
  final_sent_text: string | null;
  sent_at: string | null;
  replied: 0 | 1;
  followup_due_date: string | null;
  created_at: string;
}
