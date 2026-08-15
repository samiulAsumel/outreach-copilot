# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-user tool that turns "resume + a company name and URL" into a personalized
cold-outreach draft — on email, LinkedIn (DM or connection note), WhatsApp, or as a
cover letter — which the user then edits and sends manually from their own
account on that channel. Not a mass-mailer, not multi-tenant, and never
automated on any channel (LinkedIn's ToS in particular forbids automated
messaging/connecting — see "Out of scope" below) — there is exactly one user, one
resume, and a hand-picked list of tens of leads. Password-protected (Phase 1 auth,
see below); nothing is readable or writable without a valid session token. See
`README.md` for the full spec/roadmap this was built from.

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
                gates everything behind LoginScreen.tsx until api.checkSession() resolves
  components/     ProfileEditor, LeadForm, LeadList, DraftPanel, LeadTimeline,
                  Dashboard (analytics), LoginScreen, QuotaBar
  lib/channels.ts  CHANNEL_LABEL — single source of truth for channel display
                   names, shared by DraftPanel and LeadTimeline so they can't drift
worker/         API Worker — the only thing that touches D1 or Workers AI, deployed
                standalone (no build step; wrangler bundles the TS directly)
  index.ts        route dispatcher; requireAuth() gates every route but login, then
                  wraps every response in CORS (lib/http.ts)
  lib/db.ts        every D1 query, all prepared statements
  lib/auth.ts      stateless bearer-token issue/verify + login rate limiting
  lib/prompt.ts    pure prompt builder — the honesty guard + per-channel CHANNEL_SPECS
                   live here, unit-tested
  lib/ai.ts        the only place env.AI.run() is called; a future fallback-model seam
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
  function in `worker/lib/db.ts`. This mattered even before auth existed, and
  matters more now that every route is reachable by a bearer token, not just
  local trust.
- **`bin-links=false` in `.npmrc` is required** — this repo lives on an exFAT drive
  (no symlinks), so every package.json script calls
  `node node_modules/<pkg>/bin/...` directly instead of relying on
  `node_modules/.bin`. If you add a new script, follow that pattern.
- **204 responses never carry a body.** `worker/lib/http.ts`'s `noContent()` exists
  because `Response.json(..., {status: 204})` throws — the Fetch spec forbids a body
  on null-body statuses.
- A lead can be redrafted (tone changed, regenerated, or drafted on a second
  channel) before being sent — `POST /api/v1/leads/:id/sent` takes `{channel}` and
  operates on that lead's *most recent draft on that specific channel*
  (`db.getLatestLogForLead(env, leadId, channel)`), not just the most recent draft
  overall. Without the channel filter, drafting on email then LinkedIn before
  sending either one would let "mark sent" stamp the wrong channel's message.
- **CORS is applied in exactly one place**: `worker/index.ts` wraps every response
  (including thrown errors) with `withCors()` and answers `OPTIONS` before routing.
  Don't add CORS headers inside individual route handlers — it belongs at that one
  seam so `CORS_ORIGIN` only ever needs to be right in one place. **`corsHeaders()`
  in `worker/lib/http.ts` must list every method AND header actually used** — a
  missing entry in `Access-Control-Allow-Methods`/`-Headers` doesn't error
  server-side at all; the browser silently blocks the real request client-side as
  a generic `TypeError: Failed to fetch`, with nothing in `wrangler tail` because
  the Worker is never even invoked. (This exact bug shipped once: `PUT` was
  missing from `Allow-Methods`, so every "Save resume" click failed silently in
  the browser while curl — which doesn't enforce CORS — worked fine and hid it.)
  Verify CORS changes in an actual browser, never just curl.
- **The honesty guard covers the CV/portfolio-link claims too, not just skills, on
  every channel.** `worker/lib/prompt.ts`'s `closingInstruction()` explicitly
  forbids mentioning an attachment when `hasCvFile` is false, and forbids it
  unconditionally on channels with no attachment concept at all (LinkedIn DM/
  connection note, WhatsApp) regardless of `hasCvFile` — an implicit "just don't
  mention it" is exactly the kind of instruction models drift on, so it has to be
  spelled out the same way `FORBIDDEN_CLAIMS` is. If you touch this function or
  `CHANNEL_SPECS`, re-run `npm test`.
- **A migration that rebuilds a table SQLite/D1 can't ALTER a CHECK constraint on,
  never DROP the parent side of an `ON DELETE CASCADE` while a populated child
  table still points at it — even a *brand new* child table you just finished
  populating in the same migration.** D1 enforces foreign keys, and SQLite treats
  `DROP TABLE` on a referenced parent as an implicit cascading DELETE against every
  row in every table with a live `REFERENCES ... ON DELETE CASCADE` to it,
  regardless of statement order within the file. `PRAGMA foreign_keys = OFF` does
  **not** reliably suppress this across statements in a D1 migration (each
  statement did not appear to see the same PRAGMA state in testing). This cost real
  production data once (`migrations/0004_add_channels.sql`'s first version silently
  dropped 2 draft-log rows on `DROP TABLE leads`, recovered only via a Time Travel
  bookmark taken beforehand). The fix that worked: stage the child table's data in
  a plain table with **no foreign key at all** first, do the parent (`leads`)
  rebuild, then create the real FK-bearing child table from the staged copy last —
  see that migration file's comment for the full sequence. Before running *any*
  migration that rebuilds a table with FK-referencing children against production:
  reproduce it against local D1 first with seeded data matching production's shape
  (empty tables don't exercise this bug — local dev had zero rows the first time
  and didn't catch it), and take a `wrangler d1 time-travel info` bookmark
  immediately before the real run regardless.

## Resolved — "Save resume" vs CV upload confusion (2026-08-15)

`ProfileEditor.tsx` uploads the CV file immediately on file-select, but
`content_text` and `portfolio_link` only save on explicit "Save resume" click.
That two-model split caused a confirmed live bug: the user typed a portfolio link
and resume text, uploaded a CV (saved fine), but never clicked "Save resume", so
`content_text`/`portfolio_link` stayed stale on the server with no error shown.

Kept explicit save for the text/link fields (the code's existing comment already
documents why: this content changes ~monthly, so autosave-on-blur would just spam
D1 writes against the free-tier daily write limit for no benefit) and instead made
the unsaved state impossible to miss:
- A `panel__unsaved` warning line appears under the Save button whenever `dirty` is
  true, telling the user explicitly that changes won't be kept until they save.
- A hint above the CV row now states outright that CV upload saves immediately and
  separately from the text/link fields.

Verified against the local dev site (`npm run dev` + `npm run dev:api`) on
2026-08-15: editing the textarea shows the warning and enables the button; reloading
without saving discards the edit and the warning disappears, confirming no false
"saved" state.

## Out of scope

**Never build LinkedIn (or any channel) automation** — auto-sending, auto-connecting,
scraping profiles, or anything that acts on the user's behalf on a platform. This
isn't a "not yet" like the items below; it's a hard line. LinkedIn's Terms of
Service explicitly forbid automated messaging/connection activity, and building it
risks the user's real account getting restricted or banned. Every channel this
tool supports produces a draft the user copies and sends by hand — that's the
whole design, not a placeholder for automation later. See README's "Why this
exists" for the same point made to the user.

Not yet built, don't add unless asked: an AI Gateway / fallback model,
company-URL auto-fetch (`fetched_context` stays `null`), a weekly summary digest,
and a sidebar/multi-view navigation restructure (the app is still a single
scrolling page by design — see README's Roadmap for why that split was deferred
rather than rushed). Don't build ahead of what's actually been asked for.

## Working conventions

- Conventional Commits with scopes (`feat(worker): ...`, `fix(prompt): ...`).
- Commit only when asked; push only when asked.
- No LICENSE/CONTRIBUTING — this user's project repos don't carry them.
