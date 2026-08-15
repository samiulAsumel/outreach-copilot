import type { Env } from '../types';
import { unauthorized, AppError } from './http';

// Bearer token in the Authorization header, not a cookie. The Pages
// frontend and this Worker are different registrable domains in
// production, so a session cookie would be a third-party cookie —
// increasingly blocked by default in Chrome/Safari. A signed, stateless
// token sidesteps that entirely: no session table, no server-side revoke
// list, just an HMAC over an expiry timestamp.
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const RATE_LIMIT_WINDOW_MINUTES = 15;
const RATE_LIMIT_MAX_ATTEMPTS = 5;

function base64UrlEncode(bytes: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmac(secret: string, message: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
}

// Compares fixed-length digests rather than the raw secret — comparing raw
// strings with a short-circuiting === leaks the secret's length and prefix
// through response timing. Workers' runtime has no Node crypto.timingSafeEqual,
// so this XOR-accumulator is the manual equivalent.
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function verifyPassword(env: Env, candidate: string): Promise<boolean> {
  const [candidateDigest, expectedDigest] = await Promise.all([
    hmac(env.SESSION_SECRET, candidate),
    hmac(env.SESSION_SECRET, env.DASHBOARD_PASSWORD),
  ]);
  return constantTimeEqual(new Uint8Array(candidateDigest), new Uint8Array(expectedDigest));
}

export async function issueToken(env: Env): Promise<string> {
  const payload = JSON.stringify({ exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS });
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(payload).buffer as ArrayBuffer);
  const sig = await hmac(env.SESSION_SECRET, payloadB64);
  return `${payloadB64}.${base64UrlEncode(sig)}`;
}

async function verifyToken(env: Env, token: string): Promise<boolean> {
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, sigB64] = parts;
  const expectedSig = await hmac(env.SESSION_SECRET, payloadB64);
  if (!constantTimeEqual(base64UrlDecode(sigB64), new Uint8Array(expectedSig))) return false;
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64))) as { exp?: unknown };
    return typeof payload.exp === 'number' && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

// Called at the top of the route dispatcher for every route except
// /api/v1/auth/login — see worker/index.ts. Throwing AppError here means
// the existing try/catch in the fetch handler turns this into a properly
// CORS-wrapped 401, the same as any other route error.
export async function requireAuth(request: Request, env: Env): Promise<void> {
  const header = request.headers.get('Authorization') ?? '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match || !(await verifyToken(env, match[1]))) {
    throw unauthorized('Invalid or expired session — please log in again');
  }
}

export async function checkLoginRateLimit(env: Env): Promise<void> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM auth_attempt WHERE attempted_at > datetime('now', ?1)`
  )
    .bind(`-${RATE_LIMIT_WINDOW_MINUTES} minutes`)
    .first<{ n: number }>();
  if ((row?.n ?? 0) >= RATE_LIMIT_MAX_ATTEMPTS) {
    throw new AppError(
      `Too many failed login attempts — try again in ${RATE_LIMIT_WINDOW_MINUTES} minutes`,
      429,
      'TOO_MANY_ATTEMPTS'
    );
  }
}

export async function recordFailedLoginAttempt(env: Env): Promise<void> {
  await env.DB.prepare('INSERT INTO auth_attempt DEFAULT VALUES').run();
}
