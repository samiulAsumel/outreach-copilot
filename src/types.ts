// Mirrors worker/types.ts DTOs. Kept as a separate copy rather than a
// shared import: the SPA build (tsconfig.json, lib: DOM) and the Worker
// build (worker/tsconfig.json, no DOM) are intentionally isolated project
// boundaries — see the comment in tsconfig.json.
export type LeadStatus = 'new' | 'drafted' | 'sent' | 'replied' | 'closed';
export type Tone = 'formal' | 'casual';

// Every channel produces a draft the user copies and sends by hand — see
// worker/lib/prompt.ts's CHANNEL_SPECS for the format rules per channel.
// Nothing here ever sends on the user's behalf.
export type Channel = 'email' | 'linkedin_dm' | 'linkedin_connection' | 'whatsapp' | 'cover_letter';

export interface ResumeProfile {
  id: 1;
  content_text: string;
  portfolio_link: string | null;
  cv_file_name: string | null;
  cv_file_uploaded_at: string | null;
  updated_at: string | null;
}

// LinkedIn's own connection lifecycle, tracked separately from LeadStatus —
// connecting and getting a reply are different events on LinkedIn
// specifically.
export type LinkedinStatus = 'not_connected' | 'requested' | 'connected';

export interface Lead {
  id: number;
  // Both nullable — a lead can be just a person (e.g. a LinkedIn contact
  // with no specific company attached).
  company_name: string | null;
  url: string | null;
  contact_name: string | null;
  contact_email: string | null;
  linkedin_url: string | null;
  whatsapp_number: string | null;
  fetched_context: string | null;
  status: LeadStatus;
  linkedin_status: LinkedinStatus;
  created_at: string;
}

export interface OutreachLogEntry {
  id: number;
  lead_id: number;
  channel: Channel;
  tone: Tone | null;
  draft_text: string;
  final_sent_text: string | null;
  sent_at: string | null;
  replied: 0 | 1;
  followup_due_date: string | null;
  created_at: string;
}

export interface AnalyticsSummary {
  leads_total: number;
  leads_by_status: Record<LeadStatus, number>;
  sent_total: number;
  replied_total: number;
  reply_rate: number;
  followups_overdue: number;
  drafts_by_channel: Record<Channel, number>;
}
