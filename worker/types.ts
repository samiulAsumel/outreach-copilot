// Bindings declared in wrangler.jsonc. Kept as a hand-written interface
// (not the wrangler-generated worker-configuration.d.ts) so it stays
// readable and the reason for each binding is documented right where it's
// used, matching the house convention (see world-kitchen-atlas/worker/types.ts).
export interface Env {
  // D1 database `outreach-copilot-db` — resume_profile, leads, email_log.
  DB: D1Database;
  // Workers AI binding — used to generate outreach drafts (worker/lib/ai.ts).
  AI: Ai;
  // Model id, e.g. "@cf/zai-org/glm-4.7-flash". A `vars` entry rather than
  // hardcoded so swapping models (or bumping to a newer free-tier model) is
  // a wrangler.jsonc edit, not a code change.
  AI_MODEL: string;
}

export interface ResumeProfile {
  id: 1;
  content_text: string;
  updated_at: string;
}

export type LeadStatus = 'new' | 'drafted' | 'sent' | 'replied';

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

export type Tone = 'formal' | 'casual';

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
