// API Worker for outreach-copilot. Deployed standalone (`wrangler deploy`) —
// the frontend is a separate Cloudflare Pages project, so every response
// here carries CORS headers for that origin (see lib/http.ts's withCors).
//
// Routes (all under /api/v1/, response envelope documented in lib/http.ts):
//   GET/PUT  /api/v1/profile              resume profile (single row)
//   GET/POST /api/v1/leads                list / create leads
//   PATCH    /api/v1/leads/:id            update status or replied flag
//   DELETE   /api/v1/leads/:id            remove a lead
//   POST     /api/v1/leads/:id/draft      generate an AI draft, log it
//   POST     /api/v1/leads/:id/sent       record the lead's latest draft as sent
//   GET      /api/v1/usage                drafts generated today
//
// Bindings: DB (D1), AI (Workers AI), AI_MODEL / CORS_ORIGIN (vars) — see types.ts.
import type { Env } from './types';
import { AppError, jsonError, corsHeaders, withCors } from './lib/http';
import { handleGetProfile, handlePutProfile } from './routes/profile';
import { handleListLeads, handleCreateLead, handleUpdateLead, handleDeleteLead } from './routes/leads';
import { handleGenerateDraft, handleMarkSent, handleUsage } from './routes/draft';

const LEAD_ID_RE = /^\/api\/v1\/leads\/(\d+)$/;
const LEAD_DRAFT_RE = /^\/api\/v1\/leads\/(\d+)\/draft$/;
const LEAD_SENT_RE = /^\/api\/v1\/leads\/(\d+)\/sent$/;

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;
  const { method } = request;

  if (pathname === '/api/v1/profile') {
    if (method === 'GET') return await handleGetProfile(env);
    if (method === 'PUT') return await handlePutProfile(request, env);
  }

  if (pathname === '/api/v1/leads') {
    if (method === 'GET') return await handleListLeads(env);
    if (method === 'POST') return await handleCreateLead(request, env);
  }

  const draftMatch = pathname.match(LEAD_DRAFT_RE);
  if (draftMatch && method === 'POST') {
    return await handleGenerateDraft(request, env, Number(draftMatch[1]));
  }

  const sentMatch = pathname.match(LEAD_SENT_RE);
  if (sentMatch && method === 'POST') {
    return await handleMarkSent(request, env, Number(sentMatch[1]));
  }

  const leadIdMatch = pathname.match(LEAD_ID_RE);
  if (leadIdMatch) {
    const id = Number(leadIdMatch[1]);
    if (method === 'PATCH') return await handleUpdateLead(request, env, id);
    if (method === 'DELETE') return await handleDeleteLead(env, id);
  }

  if (pathname === '/api/v1/usage' && method === 'GET') {
    return await handleUsage(env);
  }

  throw new AppError('No route matches this request', 404, 'ROUTE_NOT_FOUND');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Preflight never reaches route() — it carries no body/auth to validate
    // and browsers expect a bare 204 with the CORS headers, not a JSON envelope.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    try {
      return withCors(await route(request, env), env);
    } catch (err) {
      if (err instanceof AppError) {
        return withCors(jsonError(err), env);
      }
      // Any unexpected exception: never expose the stack trace to the
      // client (global error-handling rule) — log it server-side via
      // console.error (visible in `wrangler tail` / the dashboard) and
      // return a generic 500.
      console.error('Unhandled error in Worker fetch handler:', err);
      return withCors(jsonError(new AppError('Internal server error', 500, 'INTERNAL_ERROR')), env);
    }
  },
} satisfies ExportedHandler<Env>;
