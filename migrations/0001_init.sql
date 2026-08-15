-- Single-user tool: resume_profile always has exactly one row (id = 1),
-- enforced by application code (worker/lib/db.ts uses INSERT ... ON CONFLICT
-- DO UPDATE against id = 1) rather than a table-level constraint, since D1
-- doesn't need more than that for a table that will only ever hold one row.
CREATE TABLE resume_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  content_text TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_name TEXT NOT NULL,
  url TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  -- Populated by the Phase 3 URL fetch step; NULL until then. Kept in the
  -- schema now so that feature doesn't need a migration later.
  fetched_context TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'drafted', 'sent', 'replied')),
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- Used by both the lead list (filter by status) and the "sent today" counter
-- (range scan on created_at) — without this, either query becomes a full
-- table scan, which is what D1's free-tier row-read limit actually bills.
CREATE INDEX idx_leads_status ON leads (status);
CREATE INDEX idx_leads_created_at ON leads (created_at);

CREATE TABLE email_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
  -- 'formal' | 'casual' — spec's two-variant idea (build roadmap, extra
  -- suggestions #3). Nullable so Phase 0 can ship a single default draft
  -- per lead without a second migration once tone selection is added.
  tone TEXT,
  draft_text TEXT NOT NULL,
  final_sent_text TEXT,
  sent_at TEXT,
  replied INTEGER NOT NULL DEFAULT 0 CHECK (replied IN (0, 1)),
  followup_due_date TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX idx_email_log_lead_id ON email_log (lead_id);
-- Backs the "N drafts generated today" quota counter (GET /api/v1/usage) —
-- a date-range WHERE on an unindexed created_at would scan the whole table
-- on every dashboard page load.
CREATE INDEX idx_email_log_created_at ON email_log (created_at);
