import type { Env } from '../types';
import { jsonOk, badRequest, unauthorized } from '../lib/http';
import { verifyPassword, issueToken, checkLoginRateLimit, recordFailedLoginAttempt } from '../lib/auth';

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  // Checked before parsing the body so a flood of malformed requests can't
  // dodge the limit.
  await checkLoginRateLimit(env);

  const body = await request.json<{ password?: unknown }>().catch(() => null);
  if (!body || typeof body.password !== 'string' || !body.password) {
    throw badRequest('password (string) is required');
  }

  if (!(await verifyPassword(env, body.password))) {
    await recordFailedLoginAttempt(env);
    throw unauthorized('Incorrect password');
  }

  const token = await issueToken(env);
  return jsonOk({ token }, 'Logged in');
}

// Reaching this handler at all means worker/index.ts's requireAuth gate
// already validated the token — this just gives the frontend a cheap way
// to check "is my stored token still good?" on app load without touching
// real data.
export async function handleSession(): Promise<Response> {
  return jsonOk({ valid: true });
}
