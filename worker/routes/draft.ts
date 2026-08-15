import type { Env, Tone } from '../types';
import { jsonOk, badRequest, notFound } from '../lib/http';
import { buildDraftPrompt } from '../lib/prompt';
import { generateDraft } from '../lib/ai';
import * as db from '../lib/db';

const VALID_TONES: Tone[] = ['formal', 'casual'];

export async function handleGenerateDraft(request: Request, env: Env, leadId: number): Promise<Response> {
  const lead = await db.getLead(env, leadId);
  if (!lead) {
    throw notFound('Lead');
  }

  const body = await request.json<{ tone?: unknown }>().catch(() => ({}) as { tone?: unknown });
  const tone: Tone = VALID_TONES.includes(body.tone as Tone) ? (body.tone as Tone) : 'formal';

  const profile = await db.getProfile(env);
  if (!profile || !profile.content_text.trim()) {
    throw badRequest(
      'No resume profile saved yet — add one before generating drafts.',
      ['resume_profile.content_text']
    );
  }

  const messages = buildDraftPrompt({ resumeText: profile.content_text, lead, tone });
  const draftText = await generateDraft(env, messages);

  const logEntry = await db.insertDraft(env, leadId, tone, draftText);
  await db.updateLeadStatus(env, leadId, 'drafted');

  return jsonOk(logEntry, 'Draft generated', 201);
}

export async function handleMarkSent(request: Request, env: Env, leadId: number): Promise<Response> {
  const lead = await db.getLead(env, leadId);
  if (!lead) {
    throw notFound('Lead');
  }

  const body = await request.json<{ final_sent_text?: unknown }>().catch(() => null);
  if (!body || typeof body.final_sent_text !== 'string' || !body.final_sent_text.trim()) {
    throw badRequest('final_sent_text (string) is required');
  }

  // "Sent" always applies to this lead's most recent draft — a lead can be
  // redrafted (e.g. switching tone) before being sent, but only the latest
  // attempt is ever what actually went out.
  const latestLog = await db.getLatestLogForLead(env, leadId);
  if (!latestLog) {
    throw badRequest('No draft exists for this lead yet — generate one first.');
  }

  const updated = await db.markSent(env, latestLog.id, body.final_sent_text);
  if (!updated) {
    throw notFound('Email log entry');
  }
  await db.updateLeadStatus(env, leadId, 'sent');

  return jsonOk(updated, 'Marked as sent');
}

export async function handleUsage(env: Env): Promise<Response> {
  const draftsToday = await db.draftsGeneratedToday(env);
  return jsonOk({ drafts_today: draftsToday });
}
