-- Campaign queue dead letters (BullMQ job failures)

CREATE TABLE IF NOT EXISTS campaign_job_dead_letters (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  job_id TEXT,
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_dead_letters_open
  ON campaign_job_dead_letters (campaign_id)
  WHERE resolved_at IS NULL;
