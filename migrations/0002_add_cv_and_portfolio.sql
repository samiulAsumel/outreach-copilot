-- The CV file is stored directly in D1 as a BLOB, not in a separate object
-- store — a resume file is small (capped well under D1's 2 MB max row/BLOB
-- size, see worker/routes/profile.ts) and this is a single-user tool, so a
-- second Cloudflare service (R2) isn't worth the extra moving part just to
-- hold one file. cv_file_data is deliberately excluded from getProfile()'s
-- normal SELECT (worker/lib/db.ts) so routine profile fetches stay small;
-- only the CV download route reads it.
ALTER TABLE resume_profile ADD COLUMN portfolio_link TEXT;
ALTER TABLE resume_profile ADD COLUMN cv_file_name TEXT;
ALTER TABLE resume_profile ADD COLUMN cv_file_type TEXT;
ALTER TABLE resume_profile ADD COLUMN cv_file_data BLOB;
ALTER TABLE resume_profile ADD COLUMN cv_file_uploaded_at TEXT;
