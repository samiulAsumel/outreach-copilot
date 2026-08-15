-- A lead can now be just a person (e.g. someone found on LinkedIn with no
-- specific company attached) — company_name and url move from NOT NULL to
-- nullable. SQLite can't ALTER a column's NOT NULL constraint in place, so
-- this rebuilds leads (same reasoning as migrations/0004).
--
-- Same foreign-key-cascade gotcha documented in CLAUDE.md applies here too:
-- outreach_log references leads(id) ON DELETE CASCADE, so a bare
-- DROP TABLE leads would silently cascade-delete every outreach_log row.
-- Stage outreach_log's data in a table with NO foreign key first, rebuild
-- leads, then recreate the real outreach_log (with its FK to the
-- now-final leads) from the staged copy — see migrations/0004's comment
-- for the full story of why this order matters.
CREATE TABLE outreach_log_staging AS SELECT * FROM outreach_log;
DROP TABLE outreach_log;

CREATE TABLE leads_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_name TEXT,
  url TEXT,
  contact_name TEXT,
  contact_email TEXT,
  linkedin_url TEXT,
  whatsapp_number TEXT,
  fetched_context TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'drafted', 'sent', 'replied', 'closed')),
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

INSERT INTO leads_new (id, company_name, url, contact_name, contact_email, linkedin_url, whatsapp_number, fetched_context, status, created_at)
SELECT id, company_name, url, contact_name, contact_email, linkedin_url, whatsapp_number, fetched_context, status, created_at
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
SELECT id, lead_id, channel, tone, draft_text, final_sent_text, sent_at, replied, followup_due_date, created_at
FROM outreach_log_staging;

DROP TABLE outreach_log_staging;

CREATE INDEX idx_outreach_log_lead_id ON outreach_log (lead_id);
CREATE INDEX idx_outreach_log_lead_channel ON outreach_log (lead_id, channel);
CREATE INDEX idx_outreach_log_created_at ON outreach_log (created_at);
