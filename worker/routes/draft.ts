import type { Env, Tone, Channel } from '../types';
import { jsonOk, badRequest, notFound } from '../lib/http';
import { buildDraftPrompt, CHANNEL_SPECS } from '../lib/prompt';
import { generateDraft } from '../lib/ai';
import * as db from '../lib/db';

const VALID_TONES: Tone[] = ['formal', 'casual'];
const VALID_CHANNELS = Object.keys(CHANNEL_SPECS) as Channel[];

export async function handleGenerateDraft(request: Request, env: Env, leadId: number): Promise<Response> {
  const lead = await db.getLead(env, leadId);
  if (!lead) {
    throw notFound('Lead');
  }

  const body = await request.json<{ tone?: unknown; channel?: unknown }>().catch(() => ({}) as { tone?: unknown; channel?: unknown });
  const tone: Tone = VALID_TONES.includes(body.tone as Tone) ? (body.tone as Tone) : 'formal';
  if (body.channel !== undefined && !VALID_CHANNELS.includes(body.channel as Channel)) {
    throw badRequest('channel must be one of: ' + VALID_CHANNELS.join(', '));
  }
  const channel: Channel = VALID_CHANNELS.includes(body.channel as Channel) ? (body.channel as Channel) : 'email';

  const profile = await db.getProfile(env);
  if (!profile || !profile.content_text.trim()) {
    throw badRequest(
      'No resume profile saved yet — add one before generating drafts.',
      ['resume_profile.content_text']
    );
  }

  const messages = buildDraftPrompt({
    resumeText: profile.content_text,
    lead,
    tone,
    channel,
    portfolioLink: profile.portfolio_link,
    hasCvFile: Boolean(profile.cv_file_name),
  });
  const draftText = await generateDraft(env, messages);

  const logEntry = await db.insertDraft(env, leadId, channel, tone, draftText);
  await db.updateLeadStatus(env, leadId, 'drafted');

  return jsonOk(logEntry, 'Draft generated', 201);
}

export async function handleMarkSent(request: Request, env: Env, leadId: number): Promise<Response> {
  const lead = await db.getLead(env, leadId);
  if (!lead) {
    throw notFound('Lead');
  }

  const body = await request.json<{ final_sent_text?: unknown; channel?: unknown }>().catch(() => null);
  if (!body || typeof body.final_sent_text !== 'string' || !body.final_sent_text.trim()) {
    throw badRequest('final_sent_text (string) is required');
  }
  if (!VALID_CHANNELS.includes(body.channel as Channel)) {
    throw badRequest('channel must be one of: ' + VALID_CHANNELS.join(', '));
  }
  const channel = body.channel as Channel;

  // "Sent" always applies to this lead's most recent draft *on this
  // channel* — a lead can be drafted on more than one channel (e.g. email
  // and a LinkedIn DM) before either is sent, so marking without a channel
  // filter risks stamping the wrong message as sent.
  const latestLog = await db.getLatestLogForLead(env, leadId, channel);
  if (!latestLog) {
    throw badRequest('No draft exists for this lead on this channel yet — generate one first.');
  }

  const updated = await db.markSent(env, latestLog.id, body.final_sent_text);
  if (!updated) {
    throw notFound('Outreach log entry');
  }
  await db.updateLeadStatus(env, leadId, 'sent');

  return jsonOk(updated, 'Marked as sent');
}

export async function handleLeadHistory(env: Env, leadId: number): Promise<Response> {
  const lead = await db.getLead(env, leadId);
  if (!lead) {
    throw notFound('Lead');
  }
  return jsonOk(await db.getLogHistoryForLead(env, leadId));
}

export async function handleUsage(env: Env): Promise<Response> {
  const draftsToday = await db.draftsGeneratedToday(env);
  return jsonOk({ drafts_today: draftsToday });
}
