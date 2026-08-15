-- Rate-limits login attempts. Worker isolates don't share memory between
-- requests, so a failed-attempt counter has to live in D1, not a
-- module-level variable, to actually work as a limit.
CREATE TABLE auth_attempt (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempted_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- Backs the "count failed attempts in the last 15 minutes" query in
-- worker/lib/auth.ts — without this, that's a full table scan on every
-- login attempt, which is itself an abuse vector.
CREATE INDEX idx_auth_attempt_attempted_at ON auth_attempt (attempted_at);
