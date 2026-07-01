-- Browser lane: job tracking and provider linkage

CREATE TABLE IF NOT EXISTS browser_jobs (
  id SERIAL PRIMARY KEY,
  browser_profile_id INTEGER NOT NULL REFERENCES browser_profiles(id) ON DELETE CASCADE,
  provider_id INTEGER REFERENCES providers(id),
  message_id INTEGER REFERENCES messages(id),
  job_type TEXT NOT NULL DEFAULT 'send',
  status TEXT NOT NULL DEFAULT 'queued',
  payload JSONB DEFAULT '{}',
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_browser_jobs_profile_id ON browser_jobs(browser_profile_id);
CREATE INDEX IF NOT EXISTS idx_browser_jobs_status ON browser_jobs(status);

ALTER TABLE browser_profiles ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE browser_profiles ADD COLUMN IF NOT EXISTS last_poll_at TIMESTAMPTZ;
ALTER TABLE browser_profiles ADD COLUMN IF NOT EXISTS last_session_check_at TIMESTAMPTZ;
