import type { Env, ResumeProfile, CvFile, Lead, LeadStatus, Tone, EmailLogEntry } from '../types';

// Every query in this file uses D1's .bind() prepared statements — never
// string-concatenated SQL — even though this is a single-user tool with no
// untrusted callers yet. Phase 1 adds a password gate, not a rewrite of
// this file, so it has to already be safe against injection.

export async function getProfile(env: Env): Promise<ResumeProfile | null> {
  // cv_file_data deliberately excluded — see the comment on ResumeProfile
  // in types.ts. getCvFile() below is the only query that reads it.
  return env.DB.prepare(
    `SELECT id, content_text, portfolio_link, cv_file_name,
            cv_file_uploaded_at, updated_at
     FROM resume_profile WHERE id = 1`
  ).first<ResumeProfile>();
}

export async function saveProfile(
  env: Env,
  contentText: string,
  portfolioLink: string | null
): Promise<ResumeProfile> {
  await env.DB.prepare(
    `INSERT INTO resume_profile (id, content_text, portfolio_link, updated_at)
     VALUES (1, ?1, ?2, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO UPDATE SET content_text = ?1, portfolio_link = ?2, updated_at = CURRENT_TIMESTAMP`
  )
    .bind(contentText, portfolioLink)
    .run();
  const saved = await getProfile(env);
  if (!saved) {
    throw new Error('resume_profile row missing immediately after upsert');
  }
  return saved;
}

// The CV file bytes live in this same D1 row (cv_file_data) — small enough
// (routes/profile.ts caps uploads well under D1's 2 MB max row/BLOB size)
// that a separate object store isn't worth the extra moving part. Upserts
// the same way saveProfile does, since a CV can be uploaded before any
// resume text has ever been saved.
export async function setCvFile(
  env: Env,
  fileName: string,
  contentType: string,
  data: ArrayBuffer
): Promise<ResumeProfile> {
  await env.DB.prepare(
    `INSERT INTO resume_profile (id, cv_file_name, cv_file_type, cv_file_data, cv_file_uploaded_at, updated_at)
     VALUES (1, ?1, ?2, ?3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO UPDATE SET
       cv_file_name = ?1, cv_file_type = ?2, cv_file_data = ?3,
       cv_file_uploaded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`
  )
    .bind(fileName, contentType, data)
    .run();
  const saved = await getProfile(env);
  if (!saved) {
    throw new Error('resume_profile row missing immediately after CV upsert');
  }
  return saved;
}

export async function getCvFile(env: Env): Promise<CvFile | null> {
  const row = await env.DB.prepare(
    `SELECT cv_file_data, cv_file_name, cv_file_type FROM resume_profile WHERE id = 1`
  ).first<{ cv_file_data: ArrayBuffer | number[] | null; cv_file_name: string | null; cv_file_type: string | null }>();
  if (!row?.cv_file_data || !row.cv_file_name || !row.cv_file_type) {
    return null;
  }
  // The deployed D1 binding returns BLOB columns as a plain number array
  // over its RPC layer, not a real ArrayBuffer (confirmed by direct
  // inspection against the live API — this isn't documented behavior to
  // rely on, so normalize defensively rather than assume either shape).
  const data = Array.isArray(row.cv_file_data) ? new Uint8Array(row.cv_file_data).buffer : row.cv_file_data;
  return { data, fileName: row.cv_file_name, contentType: row.cv_file_type };
}

export async function clearCvFile(env: Env): Promise<ResumeProfile | null> {
  await env.DB.prepare(
    `UPDATE resume_profile
     SET cv_file_name = NULL, cv_file_type = NULL, cv_file_data = NULL,
         cv_file_uploaded_at = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = 1`
  ).run();
  return getProfile(env);
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
