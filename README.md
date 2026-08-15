# Outreach Copilot

A single-user tool for turning a resume and a target company into a personalized
cold-outreach message — on email, LinkedIn (DM or connection note), WhatsApp, or as
a cover letter — that the AI drafts and you review and send yourself, by hand, from
your own account on that channel. Built for a small, hand-picked lead list (tens of
companies), not mass outreach: there's no bulk import, no scheduled sending, no
automated sending on any channel, no CRM pipeline. Every send is a deliberate,
manual click — nothing here ever posts, messages, or connects on your behalf,
which also means it never risks tripping a platform's automation rules (LinkedIn's
in particular).

## Why this exists

Writing a genuinely personalized cold email for every company takes real effort,
and that effort runs out fastest on exactly the leads that matter most. This tool
keeps the resume facts in one place, generates a first draft grounded in those
facts, and gets out of the way — you still edit and send every email by hand.

## Live

- Frontend: **https://outreach-copilot.pages.dev** (Cloudflare Pages)
- API: **https://outreach-copilot-api.sasas.workers.dev** (Cloudflare Worker)

## Stack

- **Cloudflare Pages (frontend) + a separate Cloudflare Worker (API)** — matches
  this account's other live projects (portbill, carview, world-kitchen-atlas)
  rather than one combined Worker-with-assets. Pages auto-deploys on every push via
  Cloudflare's GitHub integration (already installed on this account); the API
  Worker deploys manually with `npm run deploy:api`. The two talk over CORS
  (`worker/lib/http.ts`), restricted to the Pages origin via the `CORS_ORIGIN` var
  in `wrangler.jsonc`.
- **D1** for `resume_profile` / `leads` / `outreach_log` / `auth_attempt` — five
  million free row-reads and 100k free row-writes a day is far more than a
  single-user tool with a few hundred leads will ever hit. The CV file lives here
  too, as a BLOB column (`resume_profile.cv_file_data`, capped at 1.5 MB) — no
  separate object store (R2) needed for one small file on a single-user tool, and
  no extra Cloudflare service to activate.
- **Password auth**, stateless — a signed bearer token (HMAC-SHA256 over an expiry
  timestamp, `worker/lib/auth.ts`), not a session cookie. The frontend and API are
  different registrable domains in production, so a cookie the API set would be
  third-party and increasingly blocked by default; a token in `Authorization` and
  `localStorage` sidesteps that entirely, at the cost of the frontend having to
  attach it itself (`src/api/client.ts`) rather than the browser doing it for free.
- **Workers AI** (`@cf/zai-org/glm-4.7-flash` by default) for draft generation —
  10,000 free neurons/day, no card required. The model is a `wrangler.jsonc` `vars`
  entry, not hardcoded, so swapping models is a config edit.
- **React + TypeScript + Vite**. The API Worker (`worker/index.ts`) needs no build
  step — `wrangler dev`/`deploy` bundle its TypeScript directly.
- **No framework beyond React** — this is a 4-screen dashboard for one user, not a
  product with routing, SSR, or SEO needs.

## Getting started (local dev)

```bash
npm install
node node_modules/wrangler/bin/wrangler.js d1 create outreach-copilot-db
# paste the printed database_id into wrangler.jsonc's d1_databases[0].database_id
npm run db:migrate:local
cp .dev.vars.example .dev.vars
# fill in DASHBOARD_PASSWORD and SESSION_SECRET in .dev.vars (gitignored, never commit it)
```

Local dev runs the frontend and API as two processes, matching how they're
actually deployed:

```bash
npm run dev:api    # terminal 1 — wrangler dev on :8787 (D1 + Workers AI, real API calls)
npm run dev        # terminal 2 — vite dev server; /api/* is proxied to :8787 (see vite.config.ts)
```

```bash
npm run lint          # eslint
npm run typecheck      # tsc, app + worker configs separately
npm test               # prompt honesty-guard tests (node:test, no framework)
```

## Deploying

```bash
# one-time, or whenever the password/secret need to change:
node node_modules/wrangler/bin/wrangler.js secret put DASHBOARD_PASSWORD
node node_modules/wrangler/bin/wrangler.js secret put SESSION_SECRET

npm run db:migrate:remote          # apply migrations/*.sql to the real D1 database
npm run deploy:api                 # wrangler deploy — prints the Worker's URL

# then, with that URL:
VITE_API_BASE_URL="https://outreach-copilot-api.sasas.workers.dev" npm run deploy:web
```

Deploy the API before the frontend when auth is involved — an old frontend talking
to a newly-authed API just gets 401s until it's redeployed too, but the reverse
(new frontend, old API) is more confusing to debug.

`deploy:web` builds the SPA with the API's absolute URL baked in (frontend and API
are different origins in production, unlike local dev's same-origin proxy), then
uploads it to the Pages project directly (`wrangler pages deploy`), bypassing
Cloudflare's auto-build (which doesn't know this is a Vite project pointed at a
separate API and would otherwise serve unbuilt source files).

## Data model

```
resume_profile (id=1, content_text, portfolio_link,   — one row, your resume text +
                cv_file_name, cv_file_type,              sign-off link + CV file
                cv_file_data, cv_file_uploaded_at,        (cv_file_data: BLOB, capped
                updated_at)                                at 1.5 MB, excluded from
                                                            normal profile reads)
leads          (id, company_name, url, contact_name,   — company_name and url are both nullable: a
                contact_email, linkedin_url,              lead can be a company, a person (e.g. a
                whatsapp_number, fetched_context,         LinkedIn contact with no company attached),
                status, created_at)                       or both — at least one of company_name /
                                                            contact_name / linkedin_url is required
                                                          — fetched_context: still unfetched, null for now
                                                          — status: new | drafted | sent | replied | closed
outreach_log   (id, lead_id, channel, tone,            — channel: email | linkedin_dm |
                draft_text, final_sent_text,              linkedin_connection | whatsapp | cover_letter
                sent_at, replied,
                followup_due_date, created_at)          — "latest draft" queries are scoped to
                                                            (lead_id, channel): a lead can be
                                                            drafted on more than one channel
                                                            before any of them is sent
auth_attempt   (id, attempted_at)                      — failed login timestamps, for rate limiting
```

## API

All under `/api/v1/`. Success: `{success: true, data, message}`. Error:
`{success: false, error: "CODE", message, details}`. Every route below requires
`Authorization: Bearer <token>` except login itself.

| Method | Route | |
|---|---|---|
| POST | `/api/v1/auth/login` | exchange the dashboard password for a session token (rate-limited: 5 failed attempts / 15 min) |
| GET | `/api/v1/auth/session` | check whether the current token is still valid |
| GET / PUT | `/api/v1/profile` | read / replace the resume text + portfolio link |
| POST | `/api/v1/profile/cv` | upload/replace the CV file (`multipart/form-data`, field `file`; PDF/.doc/.docx, 5 MB max) |
| GET | `/api/v1/profile/cv` | download the CV file |
| DELETE | `/api/v1/profile/cv` | remove the CV file |
| GET / POST | `/api/v1/leads` | list / create (create accepts `linkedin_url`, `whatsapp_number` alongside the email fields) |
| PATCH / DELETE | `/api/v1/leads/:id` | update status or replied flag / remove |
| POST | `/api/v1/leads/:id/draft` | generate a draft (body: `{tone: "formal"\|"casual", channel}`), logs it |
| POST | `/api/v1/leads/:id/sent` | record the lead's latest draft *on that channel* as sent (body: `{final_sent_text, channel}`), sets a 7-day follow-up date |
| GET | `/api/v1/leads/:id/history` | every draft/send logged for this lead, across all channels |
| GET | `/api/v1/usage` | drafts generated today |
| GET | `/api/v1/analytics` | lead counts by status, sent/replied/reply-rate, overdue follow-ups, drafts by channel |

## The honesty guard

The system prompt (`worker/lib/prompt.ts`) is built from the same hard content rules
already enforced in the CV repo (`00.Resume/samiulAsumel.cv/CLAUDE.md`): every claim
traceable to the resume text actually saved, RHCSA/RHCE described only as
self-directed practice in progress, no fabricated certifications, port operations
stays the primary professional identity. The same bar applies to the newer claims:
the model may only say "CV attached" when a CV file actually exists
(`resume_profile.cv_file_name` is set), and the portfolio link, when included, must
be the exact URL saved — never altered or invented. The same rules apply
identically across every channel (`worker/lib/prompt.ts`'s `CHANNEL_SPECS`) —
channel only changes the container (length, subject line or not, whether an
attachment can be mentioned at all), never the truth bar. `tests/prompt.test.ts`
asserts all of this survives any future edit to the prompt template, across every
channel.

## Known limitations

- **No company URL fetch yet.** `leads.url` is stored but not fetched;
  `fetched_context` is always `null` — drafts today work from the resume, company
  name, and (for LinkedIn) the lead's LinkedIn URL alone.
- **`/api/v1/usage` counts drafts, not neurons.** The Workers AI binding doesn't
  return a per-call neuron cost, so this is an approximation. The real number is in
  the Cloudflare dashboard (AI > Workers AI > your account). An AI Gateway would
  give proper per-request cost tracking, but isn't built yet.
- **No AI Gateway / fallback model yet** — if Workers AI's free daily allocation
  (10,000 neurons) is exhausted, draft generation just fails with a clear error
  until 00:00 UTC.
- **No LinkedIn/WhatsApp automation, and none is planned.** Every channel produces
  a draft you copy and send by hand — see "Why this exists" above for why that's a
  deliberate limit, not a gap.
- **Backups**: D1 Time Travel gives 7 days of point-in-time recovery on the free
  plan with no setup — see `wrangler d1 time-travel --help` if data ever needs
  restoring. No custom backup job exists or is planned.

## Roadmap

- **Done**: resume + leads + AI draft + copy/mailto/wa.me + D1 log; password auth
  (stateless bearer token, rate-limited login); multi-channel drafts (email,
  LinkedIn DM, LinkedIn connection note, WhatsApp, cover letter) with per-channel
  format rules and a shared honesty guard; lead status now includes `closed`;
  per-lead outreach timeline (`LeadTimeline.tsx`, backed by
  `GET /api/v1/leads/:id/history`); an analytics dashboard (lead/channel counts,
  reply rate, overdue follow-ups); a UI/UX pass — consolidated design tokens
  (status-badge colors are alpha overlays, not separate light/dark pastels),
  explicit `.btn`/variant classes instead of implicit `type=`-based styling,
  dark mode (`prefers-color-scheme` by default, an explicit per-visitor toggle
  that overrides it, both persisted to `localStorage`), and small responsive
  fixes (header wrapping, the channel bar chart's label column).
- **Not scheduled**: company URL auto-fetch into `fetched_context`; an AI Gateway
  fallback model + real per-request cost tracking; a weekly summary digest; a
  sidebar/multi-view navigation restructure (the app is still a single scrolling
  page — considered for this UI pass and deliberately deferred as higher-risk
  than the changes above, since it would touch every component's layout at once).
