// Response shape fixed by the user's global API-design rules: every success
// envelope is {success, data, message}, every error is
// {success, error, message, details}, with a matching HTTP status code.
import type { Env } from '../types';

// CORS is applied once, here, wrapped around every response in
// worker/index.ts's fetch handler — not scattered across each route — so
// there's exactly one place that decides which origin is allowed, matching
// the "single seam" pattern used elsewhere in this file (worker/lib/ai.ts).
export function corsHeaders(env: Env): HeadersInit {
  return {
    'Access-Control-Allow-Origin': env.CORS_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, PUT, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export function withCors(response: Response, env: Env): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(env))) {
    headers.set(key, value);
  }
  return new Response(response.body, { status: response.status, headers });
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly errorCode: string;
  readonly details: unknown[];

  constructor(message: string, statusCode: number, errorCode: string, details: unknown[] = []) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
  }
}

export function jsonOk<T>(data: T, message = 'OK', status = 200): Response {
  return Response.json({ success: true, data, message }, { status });
}

// 204 responses must not carry a body (Fetch spec: constructing a Response
// with a body and a null-body status throws) — so "successful DELETE"
// (global API rules: 204 No Content) can't reuse jsonOk.
export function noContent(): Response {
  return new Response(null, { status: 204 });
}

export function jsonError(err: AppError): Response {
  return Response.json(
    { success: false, error: err.errorCode, message: err.message, details: err.details },
    { status: err.statusCode }
  );
}

export function notFound(resource: string): AppError {
  return new AppError(`${resource} not found`, 404, `${resource.toUpperCase()}_NOT_FOUND`);
}

export function unauthorized(message: string): AppError {
  return new AppError(message, 401, 'UNAUTHORIZED');
}

export function badRequest(message: string, details: unknown[] = []): AppError {
  return new AppError(message, 400, 'BAD_REQUEST', details);
}
