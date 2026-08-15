# Outreach Copilot

A single-user tool for turning a resume and a target company into a personalized
cold-outreach email — the AI drafts it, you review and send it yourself from your
own inbox. Built for a small, hand-picked lead list (tens of companies), not mass
outreach: there's no bulk import, no scheduled sending, no CRM pipeline. Every send
is a deliberate, manual click.

## Why this exists

Writing a genuinely personalized cold email for every company takes real effort,
and that effort runs out fastest on exactly the leads that matter most. This tool
keeps the resume facts in one place, generates a first draft grounded in those
facts, and gets out of the way — you still edit and send every email by hand.

## Stack

- **Cloudflare Workers + static assets** (not Workers + Pages) — one deploy, one
  origin, no CORS to configure, and the Worker gets D1 + Workers AI bindings and
  Cron Triggers in the same project Pages Functions can't offer.
- **D1** for `resume_profile` / `leads` / `email_log` — five million free row-reads
  and 100k free row-writes a day is far more than a single-user tool with a few
  hundred leads will ever hit.
- **Workers AI** (`@cf/zai-org/glm-4.7-flash` by default) for draft generation —
  10,000 free neurons/day, no card required. The model is a `wrangler.jsonc` `vars`
  entry, not hardcoded, so swapping models is a config edit.
- **React + TypeScript + Vite**, via `@cloudflare/vite-plugin` — the Worker runs
  inside the real `workerd` runtime during `vite dev`, so local dev behaves like
  production (D1 and Workers AI both work locally, no mocking).
- **No framework beyond React** — this is a 4-screen dashboard for one user, not a
  product with routing, SSR, or SEO needs.

## Getting started

```bash
npm install
node node_modules/wrangler/bin/wrangler.js d1 create outreach-copilot-db
# paste the printed database_id into wrangler.jsonc's d1_databases[0].database_id
npm run db:migrate:local
npm run dev
```

Opens on the Vite dev server URL printed in the terminal. The Worker (API + D1 +
Workers AI) runs inside the same process — there's nothing else to start.

```bash
npm run lint          # eslint
npm run typecheck      # tsc, app + worker configs separately
npm test               # prompt honesty-guard tests (node:test, no framework)
```

## Data model

```
resume_profile (id=1, content_text, updated_at)      — one row, your resume text
leads          (id, company_name, url, contact_name,
                contact_email, fetched_context,        — fetched_context: Phase 3, null for now
                status, created_at)                    — status: new | drafted | sent | replied
email_log      (id, lead_id, tone, draft_text,
                final_sent_text, sent_at, replied,
                followup_due_date, created_at)
```

## API

All under `/api/v1/`. Success: `{success: true, data, message}`. Error:
`{success: false, error: "CODE", message, details}`.

| Method | Route | |
|---|---|---|
| GET / PUT | `/api/v1/profile` | read / replace the resume |
| GET / POST | `/api/v1/leads` | list / create |
| PATCH / DELETE | `/api/v1/leads/:id` | update status or replied flag / remove |
| POST | `/api/v1/leads/:id/draft` | generate a draft (body: `{tone: "formal"\|"casual"}`), logs it |
| POST | `/api/v1/leads/:id/sent` | record the lead's latest draft as sent, sets a 7-day follow-up date |
| GET | `/api/v1/usage` | drafts generated today |

## The honesty guard

The system prompt (`worker/lib/prompt.ts`) is built from the same hard content rules
already enforced in the CV repo (`00.Resume/samiulAsumel.cv/CLAUDE.md`): every claim
traceable to the resume text actually saved, RHCSA/RHCE described only as
self-directed practice in progress, no fabricated certifications, port operations
stays the primary professional identity. `tests/prompt.test.ts` asserts these
survive any future edit to the prompt template.

## Known limitations (Phase 0)

- **No auth yet.** Anyone who can reach the dev server can read/write everything.
  Fine for `wrangler dev` on localhost; do not deploy this phase publicly. Password
  auth is Phase 1.
- **Not deployed.** This phase is verified with `wrangler dev` only — no
  `wrangler deploy` has been run, no GitHub push either, pending review.
- **No company URL fetch yet.** `leads.url` is stored but not fetched;
  `fetched_context` is always `null` until Phase 3 — drafts today work from the
  resume and company name alone.
- **`/api/v1/usage` counts drafts, not neurons.** The Workers AI binding doesn't
  return a per-call neuron cost, so this is an approximation. The real number is in
  the Cloudflare dashboard (AI > Workers AI > your account). AI Gateway (Phase 2)
  gives proper per-request cost tracking.
- **No AI Gateway / Gemini fallback yet** — if Workers AI's free daily allocation
  (10,000 neurons) is exhausted, draft generation just fails with a clear error
  until 00:00 UTC. Phase 2 adds the fallback.
- **Backups**: D1 Time Travel gives 7 days of point-in-time recovery on the free
  plan with no setup — see `wrangler d1 time-travel --help` if data ever needs
  restoring. No custom backup job exists or is planned.

## Roadmap

- **Phase 0** (this): resume + leads + AI draft + copy/mailto + D1 log, local only.
- **Phase 1**: password auth, deploy to Cloudflare.
- **Phase 2**: AI Gateway (Gemini fallback + caching + real usage tracking).
- **Phase 3**: company URL auto-fetch into `fetched_context`.
- **Phase 4**: follow-up reminders, reply tracking is already in Phase 0's schema,
  weekly WhatsApp summary.
