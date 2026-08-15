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
cp .dev.vars.example .dev.vars          # Phase 0 needs no secrets — this is a no-op today
node node_modules/wrangler/bin/wrangler.js d1 create outreach-copilot-db
# ^ paste the returned database_id into wrangler.jsonc's d1_databases entry
npm run db:migrate:local                 # applies migrations/*.sql to local D1
npm run dev                              # vite dev server + Worker, one origin, HMR
npm run lint && npm run typecheck && npm test
npm run deploy                           # builds + wrangler deploy (not run automatically by CI)
```

There is nothing to install beyond `npm install` — no external services need running
locally. D1 and Workers AI both run inside `wrangler dev`'s local workerd runtime via
the Cloudflare Vite plugin; Workers AI calls the real Cloudflare API even in local
dev (there's no local emulator for it), so drafts generated locally cost real neurons
against the free daily allocation.

## Architecture

```
src/            React SPA (Vite) — dashboard UI, calls /api/v1/* only
worker/         API Worker — the only thing that touches D1 or Workers AI
  index.ts        route dispatcher, catches AppError -> {success:false,...}
  lib/db.ts        every D1 query, all prepared statements
  lib/prompt.ts    pure prompt builder — the honesty guard lives here, unit-tested
  lib/ai.ts        the only place env.AI.run() is called; Phase 2's fallback seam
migrations/     D1 schema, applied with `wrangler d1 migrations apply`
```

`wrangler.jsonc`'s `assets.run_worker_first: ["/api/*"]` means everything under
`/api/*` hits `worker/index.ts`; everything else is the built SPA served as static
assets. One Worker, one deploy, one origin — no CORS config needed, and Phase 1's
session cookie will just work same-origin.

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

## Out of scope (don't add unless asked)

Password auth, Cloudflare deploy/`wrangler.jsonc` secrets, AI Gateway + Gemini
fallback, company-URL auto-fetch (`fetched_context` stays `null`), WhatsApp summary —
these are Phases 1-4 in `README.md`'s roadmap. Don't build ahead of the phase that's
actually been asked for.

## Working conventions

- Conventional Commits with scopes (`feat(worker): ...`, `fix(prompt): ...`).
- Commit only when asked; push only when asked.
- No LICENSE/CONTRIBUTING — this user's project repos don't carry them.
