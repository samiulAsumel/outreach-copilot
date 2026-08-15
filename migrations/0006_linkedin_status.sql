-- Tracks LinkedIn's own connection lifecycle (not connected / request sent /
-- connected) separately from the general outreach `status` — connecting and
-- getting a reply are different events on LinkedIn specifically, and a lead
-- can be "connected" long before (or after, or never) its outreach status
-- moves past "drafted". Valid values are enforced in worker/routes/leads.ts,
-- not a CHECK constraint here — a plain ADD COLUMN, no table rebuild, so
-- none of the FK-cascade risk documented in CLAUDE.md for migrations 0004/
-- 0005 applies to this one.
ALTER TABLE leads ADD COLUMN linkedin_status TEXT NOT NULL DEFAULT 'not_connected';
