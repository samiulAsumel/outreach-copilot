-- Outreach stops being email-only, so email_log is renamed and widened with
-- a channel column, and leads gets LinkedIn/WhatsApp fields plus a widened
-- status CHECK. SQLite can't ALTER a CHECK constraint in place, so both
-- tables are rebuilt (create new shape, copy data, drop old, rename).
--
-- Ordering gotcha that cost real data the first time this was written and
-- run: email_log.lead_id has `REFERENCES leads (id) ON DELETE CASCADE`.
-- With foreign keys enforced (D1's default), `DROP TABLE leads` cascades
-- and deletes every row in ANY table that still has a live FK-CASCADE
-- pointing at it — including a brand new `outreach_log` already populated
-- with the copied rows. Rebuilding `leads` first doesn't help either: it
-- just cascades away `email_log` before its rows can be copied at all.
-- `PRAGMA foreign_keys = OFF` doesn't survive across statements in D1's
-- migration execution, so it can't be used to suppress this. The fix:
-- stage the log rows in a table with NO foreign key at all (immune to any
-- cascade), rebuild `leads`, and only then create the real `outreach_log`
-- (with its FK to the now-final `leads`) from the staged copy.
CREATE TABLE outreach_log_staging AS SELECT * FROM email_log;
DROP TABLE email_log;

CREATE TABLE leads_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_name TEXT NOT NULL,
  url TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  linkedin_url TEXT,
  whatsapp_number TEXT,
  fetched_context TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'drafted', 'sent', 'replied', 'closed')),
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

INSERT INTO leads_new (id, company_name, url, contact_name, contact_email, fetched_context, status, created_at)
SELECT id, company_name, url, contact_name, contact_email, fetched_context, status, created_at
FROM leads;

DROP TABLE leads;
ALTER TABLE leads_new RENAME TO leads;

CREATE INDEX idx_leads_status ON leads (status);
CREATE INDEX idx_leads_created_at ON leads (created_at);

CREATE TABLE outreach_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'email'
    CHECK (channel IN ('email', 'linkedin_dm', 'linkedin_connection', 'whatsapp', 'cover_letter')),
  tone TEXT,
  draft_text TEXT NOT NULL,
  final_sent_text TEXT,
  sent_at TEXT,
  replied INTEGER NOT NULL DEFAULT 0 CHECK (replied IN (0, 1)),
  followup_due_date TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

INSERT INTO outreach_log (id, lead_id, channel, tone, draft_text, final_sent_text, sent_at, replied, followup_due_date, created_at)
SELECT id, lead_id, 'email', tone, draft_text, final_sent_text, sent_at, replied, followup_due_date, created_at
FROM outreach_log_staging;

DROP TABLE outreach_log_staging;

CREATE INDEX idx_outreach_log_lead_id ON outreach_log (lead_id);
-- Backs "the latest draft for this lead on this channel" (worker/lib/db.ts's
-- getLatestLogForLead, now channel-aware — see comment there for why).
CREATE INDEX idx_outreach_log_lead_channel ON outreach_log (lead_id, channel);
CREATE INDEX idx_outreach_log_created_at ON outreach_log (created_at);
