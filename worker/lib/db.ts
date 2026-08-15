import type { Env, ResumeProfile, Lead, LeadStatus, Tone, EmailLogEntry } from '../types';

// Every query in this file uses D1's .bind() prepared statements — never
// string-concatenated SQL — even though this is a single-user tool with no
// untrusted callers yet. Phase 1 adds a password gate, not a rewrite of
// this file, so it has to already be safe against injection.

export async function getProfile(env: Env): Promise<ResumeProfile | null> {
  return env.DB.prepare('SELECT id, content_text, updated_at FROM resume_profile WHERE id = 1')
    .first<ResumeProfile>();
}

export async function saveProfile(env: Env, contentText: string): Promise<ResumeProfile> {
  await env.DB.prepare(
    `INSERT INTO resume_profile (id, content_text, updated_at)
     VALUES (1, ?1, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO UPDATE SET content_text = ?1, updated_at = CURRENT_TIMESTAMP`
  )
    .bind(contentText)
    .run();
  const saved = await getProfile(env);
  if (!saved) {
    throw new Error('resume_profile row missing immediately after upsert');
  }
  return saved;
}

export async function listLeads(env: Env): Promise<Lead[]> {
  const { results } = await env.DB.prepare(
    'SELECT * FROM leads ORDER BY created_at DESC'
  ).all<Lead>();
  return results;
}

export async function getLead(env: Env, id: number): Promise<Lead | null> {
  return env.DB.prepare('SELECT * FROM leads WHERE id = ?1').bind(id).first<Lead>();
}

export interface NewLead {
  companyName: string;
  url: string;
  contactName: string | null;
  contactEmail: string | null;
}

export async function createLead(env: Env, lead: NewLead): Promise<Lead> {
  const result = await env.DB.prepare(
    `INSERT INTO leads (company_name, url, contact_name, contact_email)
     VALUES (?1, ?2, ?3, ?4)
     RETURNING *`
  )
    .bind(lead.companyName, lead.url, lead.contactName, lead.contactEmail)
    .first<Lead>();
  if (!result) {
    throw new Error('lead insert returned no row');
  }
  return result;
}

export async function updateLeadStatus(
  env: Env,
  id: number,
  status: LeadStatus
): Promise<Lead | null> {
  return env.DB.prepare('UPDATE leads SET status = ?1 WHERE id = ?2 RETURNING *')
    .bind(status, id)
    .first<Lead>();
}

export async function setLeadReplied(env: Env, id: number, replied: boolean): Promise<Lead | null> {
  const status: LeadStatus = replied ? 'replied' : 'sent';
  return env.DB.prepare('UPDATE leads SET status = ?1 WHERE id = ?2 RETURNING *')
    .bind(status, id)
    .first<Lead>();
}

export async function deleteLead(env: Env, id: number): Promise<void> {
  // ON DELETE CASCADE (migrations/0001_init.sql) takes email_log rows with it.
  await env.DB.prepare('DELETE FROM leads WHERE id = ?1').bind(id).run();
}

export async function insertDraft(
  env: Env,
  leadId: number,
  tone: Tone,
  draftText: string
): Promise<EmailLogEntry> {
  const result = await env.DB.prepare(
    `INSERT INTO email_log (lead_id, tone, draft_text)
     VALUES (?1, ?2, ?3)
     RETURNING *`
  )
    .bind(leadId, tone, draftText)
    .first<EmailLogEntry>();
  if (!result) {
    throw new Error('email_log insert returned no row');
  }
  return result;
}

export async function getLatestLogForLead(env: Env, leadId: number): Promise<EmailLogEntry | null> {
  return env.DB.prepare(
    'SELECT * FROM email_log WHERE lead_id = ?1 ORDER BY created_at DESC LIMIT 1'
  )
    .bind(leadId)
    .first<EmailLogEntry>();
}

export async function markSent(
  env: Env,
  logId: number,
  finalSentText: string
): Promise<EmailLogEntry | null> {
  return env.DB.prepare(
    `UPDATE email_log
     SET final_sent_text = ?1,
         sent_at = CURRENT_TIMESTAMP,
         followup_due_date = date('now', '+7 days')
     WHERE id = ?2
     RETURNING *`
  )
    .bind(finalSentText, logId)
    .first<EmailLogEntry>();
}

export async function draftsGeneratedToday(env: Env): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM email_log WHERE date(created_at) = date('now')`
  ).first<{ n: number }>();
  return row?.n ?? 0;
}
