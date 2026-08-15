# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-user tool that turns "resume + a company name and URL" into a personalized
cold-outreach email draft, which the user then edits and sends manually from their
own Gmail. Not a mass-mailer, not multi-tenant — there is exactly one user, one
resume, and a hand-picked list of tens of leads. See `README.md` for the full
spec/roadmap this was built from.

## Commands

```bash
npm install
node node_modules/wrangler/bin/wrangler.js d1 create outreach-copilot-db
# ^ paste the returned database_id into wrangler.jsonc's d1_databases entry
npm run db:migrate:local                 # applies migrations/*.sql to local D1
npm run dev:api                          # terminal 1 — wrangler dev on :8787
npm run dev                              # terminal 2 — vite dev server, proxies /api to :8787
npm run lint && npm run typecheck && npm test
npm run deploy:api                       # wrangler deploy (the API Worker)
npm run deploy:web                       # vite build + wrangler pages deploy (the frontend)
```

Frontend and API are two local processes because they're two separate deployments
in production (Pages + a Worker) — see README "Getting started" / "Deploying".
Workers AI calls the real Cloudflare API even in local dev (there's no local
emulator for it), so drafts generated locally cost real neurons against the free
daily allocation.

## Architecture

```
src/            React SPA (Vite) — dashboard UI, calls the API via src/api/client.ts
worker/         API Worker — the only thing that touches D1 or Workers AI, deployed
                standalone (no build step; wrangler bundles the TS directly)
  index.ts        route dispatcher; wraps every response in CORS (lib/http.ts)
  lib/db.ts        every D1 query, all prepared statements
  lib/prompt.ts    pure prompt builder — the honesty guard lives here, unit-tested
  lib/ai.ts        the only place env.AI.run() is called; Phase 2's fallback seam
migrations/     D1 schema, applied with `wrangler d1 migrations apply`
```

The CV file is stored directly in D1 (`resume_profile.cv_file_data`, a BLOB) rather
than in a separate object store — it's small (capped at 1.5 MB, well under D1's 2 MB
max row/BLOB size) and this is a single-user tool, so R2 wasn't worth the extra
moving part (and its one-time dashboard activation step). `getProfile()` deliberately
excludes `cv_file_data` from its SELECT so routine profile fetches stay small; only
`lib/db.ts`'s `getCvFile()` reads it. **Non-obvious gotcha**: the deployed D1 binding
returns BLOB columns as a plain `number[]`, not a real `ArrayBuffer` — confirmed by
direct inspection against the live API, not documented anywhere — so `getCvFile()`
normalizes with `Array.isArray()` before handing the bytes to the download route.

**Frontend (Cloudflare Pages, `outreach-copilot.pages.dev`) and API (Cloudflare
Worker, `outreach-copilot-api.sasas.workers.dev`) are two separate deployments on
two different origins in production.** They talk over CORS: `worker/lib/http.ts`'s
`withCors()` wraps every response, restricted to the `CORS_ORIGIN` var in
`wrangler.jsonc`. The frontend knows the API's URL via `VITE_API_BASE_URL`, baked in
at build time (`src/api/client.ts`) — empty in dev, where `vite.config.ts`'s dev
server proxy makes `/api/*` same-origin against local `wrangler dev` instead.
Cloudflare's GitHub integration (already installed on this account) auto-builds and
redeploys the Pages project on every push to `main` — but its auto-build doesn't
know to bundle this as a Vite SPA pointed at a separate API, so real deploys use
`npm run deploy:web` (direct `wrangler pages deploy` of the built `dist/`) instead
of relying on that auto-build.

## Critical conventions (these cause real bugs if missed)

- **The honesty guard in `worker/lib/prompt.ts` is not decoration.** It embeds the
  hard content rules from `00.Resume/samiulAsumel.cv/CLAUDE.md` (never claim
  SELinux/Podman/Ansible/n8n, RHCSA/RHCE only as in-progress, port domain stays
  primary). If you edit the resume text, the tone instructions, or the prompt
  template, re-run `npm test` — `tests/prompt.test.ts` asserts every forbidden claim
  is still named and the core honesty sentences are still present. If those source
  facts change (e.g. RHCSA is actually completed one day), update
  `FORBIDDEN_CLAIMS` and the CV repo together, not just one.
- **D1 queries are always `.bind()`ed, never string-concatenated** — see every
  function in `worker/lib/db.ts`. This matters even pre-Phase-1 (no auth yet)
  because it's the pattern that has to already be right when auth is added, not a
  rewrite waiting to happen.
- **`bin-links=false` in `.npmrc` is required** — this repo lives on an exFAT drive
  (no symlinks), so every package.json script calls
  `node node_modules/<pkg>/bin/...` directly instead of relying on
  `node_modules/.bin`. If you add a new script, follow that pattern.
- **204 responses never carry a body.** `worker/lib/http.ts`'s `noContent()` exists
  because `Response.json(..., {status: 204})` throws — the Fetch spec forbids a body
  on null-body statuses.
- A lead can be redrafted (tone changed, regenerated) before being sent — `POST
  /api/v1/leads/:id/sent` always operates on that lead's *most recent* `email_log`
  row (`db.getLatestLogForLead`), not a specific log id passed by the client.
- **CORS is applied in exactly one place**: `worker/index.ts` wraps every response
  (including thrown errors) with `withCors()` and answers `OPTIONS` before routing.
  Don't add CORS headers inside individual route handlers — it belongs at that one
  seam so `CORS_ORIGIN` only ever needs to be right in one place.
- **The honesty guard covers the CV/portfolio-link claims too, not just skills.**
  `worker/lib/prompt.ts`'s `closingInstruction()` explicitly forbids mentioning an
  attachment when `hasCvFile` is false — an implicit "just don't mention it" is
  exactly the kind of instruction models drift on, so it has to be spelled out the
  same way `FORBIDDEN_CLAIMS` is. If you touch this function, re-run `npm test`.

## Out of scope (don't add unless asked)

AI Gateway + Gemini fallback, company-URL auto-fetch (`fetched_context` stays
`null`), WhatsApp summary — these are Phases 2-4 in `README.md`'s roadmap. Don't
build ahead of the phase that's actually been asked for.

**Exception: password auth (Phase 1) is no longer "later" — the site is live and
public with none.** If asked to keep building this project, flag that gap before
adding anything else; don't let feature work bury it.

## Working conventions

- Conventional Commits with scopes (`feat(worker): ...`, `fix(prompt): ...`).
- Commit only when asked; push only when asked.
- No LICENSE/CONTRIBUTING — this user's project repos don't carry them.
