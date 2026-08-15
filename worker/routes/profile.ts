import type { Env } from '../types';
import { jsonOk, badRequest } from '../lib/http';
import { getProfile, saveProfile } from '../lib/db';

export async function handleGetProfile(env: Env): Promise<Response> {
  const profile = await getProfile(env);
  // No row yet is a normal, expected state (first run) — not a 404. The
  // dashboard renders an empty editor for it.
  return jsonOk(profile ?? { id: 1, content_text: '', updated_at: null });
}

export async function handlePutProfile(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ content_text?: unknown }>().catch(() => null);
  if (!body || typeof body.content_text !== 'string') {
    throw badRequest('content_text (string) is required', ['content_text']);
  }
  const saved = await saveProfile(env, body.content_text);
  return jsonOk(saved, 'Resume profile saved');
}
