// Bindings declared in wrangler.jsonc. Kept as a hand-written interface
// (not the wrangler-generated worker-configuration.d.ts) so it stays
// readable and the reason for each binding is documented right where it's
// used, matching the house convention (see world-kitchen-atlas/worker/types.ts).
export interface Env {
  // D1 database `outreach-copilot-db` — resume_profile, leads, outreach_log, auth_attempt.
  DB: D1Database;
  // Workers AI binding — used to generate outreach drafts (worker/lib/ai.ts).
  AI: Ai;
  // Model id, e.g. "@cf/zai-org/glm-4.7-flash". A `vars` entry rather than
  // hardcoded so swapping models (or bumping to a newer free-tier model) is
  // a wrangler.jsonc edit, not a code change.
  AI_MODEL: string;
  // The Cloudflare Pages frontend's origin, e.g.
  // "https://outreach-copilot.pages.dev" — the only origin allowed to call
  // this API cross-origin (worker/lib/http.ts).
  CORS_ORIGIN: string;
  // Secrets (never in wrangler.jsonc `vars`, never committed) — set with
  // `wrangler secret put <NAME>` remotely, or in `.dev.vars` locally
  // (copied from `.dev.vars.example`). See worker/lib/auth.ts.
  DASHBOARD_PASSWORD: string;
  SESSION_SECRET: string;
}

// The CV file bytes (cv_file_data) are NOT part of this type — getProfile()
// deliberately excludes that column so routine profile fetches stay small;
// see lib/db.ts's getCvFile() for the one query that reads it. cv_file_name
// non-null is the "a CV exists" signal used everywhere else (e.g.
// routes/draft.ts's hasCvFile).
export interface ResumeProfile {
  id: 1;
  content_text: string;
  portfolio_link: string | null;
  cv_file_name: string | null;
  cv_file_uploaded_at: string | null;
  updated_at: string;
}

export interface CvFile {
  data: ArrayBuffer;
  fileName: string;
  contentType: string;
}

export type LeadStatus = 'new' | 'drafted' | 'sent' | 'replied' | 'closed';

export interface Lead {
  id: number;
  // Both nullable — a lead can be just a person (e.g. a LinkedIn contact
  // with no specific company attached). worker/routes/leads.ts requires at
  // least one of company_name / contact_name / linkedin_url to be set.
  company_name: string | null;
  url: string | null;
  contact_name: string | null;
  contact_email: string | null;
  linkedin_url: string | null;
  whatsapp_number: string | null;
  fetched_context: string | null;
  status: LeadStatus;
  created_at: string;
}

export type Tone = 'formal' | 'casual';

// Every channel produces a draft the user copies and sends by hand — see
// worker/lib/prompt.ts's CHANNEL_SPECS for the format rules per channel.
// Nothing here ever sends on the user's behalf.
export type Channel = 'email' | 'linkedin_dm' | 'linkedin_connection' | 'whatsapp' | 'cover_letter';

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
