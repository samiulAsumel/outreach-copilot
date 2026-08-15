import type { Env, ResumeProfile, CvFile, Lead, LeadStatus, LinkedinStatus, Tone, Channel, OutreachLogEntry, AnalyticsSummary } from '../types';

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
  companyName: string | null;
  url: string | null;
  contactName: string | null;
  contactEmail: string | null;
  linkedinUrl: string | null;
  whatsappNumber: string | null;
}

export async function createLead(env: Env, lead: NewLead): Promise<Lead> {
  const result = await env.DB.prepare(
    `INSERT INTO leads (company_name, url, contact_name, contact_email, linkedin_url, whatsapp_number)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     RETURNING *`
  )
    .bind(lead.companyName, lead.url, lead.contactName, lead.contactEmail, lead.linkedinUrl, lead.whatsappNumber)
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

export async function updateLeadLinkedinStatus(env: Env, id: number, status: LinkedinStatus): Promise<Lead | null> {
  return env.DB.prepare('UPDATE leads SET linkedin_status = ?1 WHERE id = ?2 RETURNING *')
    .bind(status, id)
    .first<Lead>();
}

export async function deleteLead(env: Env, id: number): Promise<void> {
  // ON DELETE CASCADE (migrations/0001_init.sql) takes outreach_log rows with it.
  await env.DB.prepare('DELETE FROM leads WHERE id = ?1').bind(id).run();
}

export async function insertDraft(
  env: Env,
  leadId: number,
  channel: Channel,
  tone: Tone,
  draftText: string
): Promise<OutreachLogEntry> {
  const result = await env.DB.prepare(
    `INSERT INTO outreach_log (lead_id, channel, tone, draft_text)
     VALUES (?1, ?2, ?3, ?4)
     RETURNING *`
  )
    .bind(leadId, channel, tone, draftText)
    .first<OutreachLogEntry>();
  if (!result) {
    throw new Error('outreach_log insert returned no row');
  }
  return result;
}

// Channel-aware on purpose: a lead can now be drafted on multiple channels
// before any of them is sent (e.g. email AND a LinkedIn DM), so "the latest
// draft for this lead" without a channel filter could return the wrong
// channel's draft to worker/routes/draft.ts's handleMarkSent — marking an
// email as sent when the user actually just sent a LinkedIn message.
export async function getLatestLogForLead(env: Env, leadId: number, channel: Channel): Promise<OutreachLogEntry | null> {
  return env.DB.prepare(
    'SELECT * FROM outreach_log WHERE lead_id = ?1 AND channel = ?2 ORDER BY created_at DESC LIMIT 1'
  )
    .bind(leadId, channel)
    .first<OutreachLogEntry>();
}

export async function getLogHistoryForLead(env: Env, leadId: number): Promise<OutreachLogEntry[]> {
  const { results } = await env.DB.prepare(
    'SELECT * FROM outreach_log WHERE lead_id = ?1 ORDER BY created_at DESC'
  )
    .bind(leadId)
    .all<OutreachLogEntry>();
  return results;
}

export async function markSent(
  env: Env,
  logId: number,
  finalSentText: string
): Promise<OutreachLogEntry | null> {
  return env.DB.prepare(
    `UPDATE outreach_log
     SET final_sent_text = ?1,
         sent_at = CURRENT_TIMESTAMP,
         followup_due_date = date('now', '+7 days')
     WHERE id = ?2
     RETURNING *`
  )
    .bind(finalSentText, logId)
    .first<OutreachLogEntry>();
}

export async function draftsGeneratedToday(env: Env): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM outreach_log WHERE date(created_at) = date('now')`
  ).first<{ n: number }>();
  return row?.n ?? 0;
}

const ALL_STATUSES: LeadStatus[] = ['new', 'drafted', 'sent', 'replied', 'closed'];
const ALL_CHANNELS: Channel[] = ['email', 'linkedin_dm', 'linkedin_connection', 'whatsapp', 'cover_letter'];

// Every query here is a plain COUNT/GROUP BY over indexed columns — cheap
// even as the log grows, and run in parallel since none depends on another.
export async function getAnalytics(env: Env): Promise<AnalyticsSummary> {
  const [statusRows, channelRows, sentTotalRow, repliedTotalRow, overdueRow] = await Promise.all([
    env.DB.prepare('SELECT status, COUNT(*) AS n FROM leads GROUP BY status').all<{ status: LeadStatus; n: number }>(),
    env.DB.prepare('SELECT channel, COUNT(*) AS n FROM outreach_log GROUP BY channel').all<{ channel: Channel; n: number }>(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM outreach_log WHERE sent_at IS NOT NULL').first<{ n: number }>(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM outreach_log WHERE replied = 1').first<{ n: number }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM outreach_log
       WHERE followup_due_date IS NOT NULL AND replied = 0 AND date(followup_due_date) < date('now')`
    ).first<{ n: number }>(),
  ]);

  const leadsByStatus = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0])) as Record<LeadStatus, number>;
  for (const row of statusRows.results) leadsByStatus[row.status] = row.n;

  const draftsByChannel = Object.fromEntries(ALL_CHANNELS.map((c) => [c, 0])) as Record<Channel, number>;
  for (const row of channelRows.results) draftsByChannel[row.channel] = row.n;

  const sentTotal = sentTotalRow?.n ?? 0;
  const repliedTotal = repliedTotalRow?.n ?? 0;

  return {
    leads_total: Object.values(leadsByStatus).reduce((a, b) => a + b, 0),
    leads_by_status: leadsByStatus,
    sent_total: sentTotal,
    replied_total: repliedTotal,
    // Guarded against div-by-zero: a fresh account with nothing sent yet
    // should read as "no rate yet," not NaN or Infinity.
    reply_rate: sentTotal > 0 ? Math.round((repliedTotal / sentTotal) * 100) : 0,
    followups_overdue: overdueRow?.n ?? 0,
    drafts_by_channel: draftsByChannel,
  };
}
