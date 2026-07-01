-- Phase 2: live provider ops — health tracking + webhook dead letters

ALTER TABLE providers ADD COLUMN IF NOT EXISTS health_ok BOOLEAN;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS health_checked_at TIMESTAMPTZ;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS health_error TEXT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS health_mode TEXT;

CREATE TABLE IF NOT EXISTS webhook_dead_letters (
  id SERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  error_message TEXT,
  verified BOOLEAN DEFAULT FALSE,
  retry_count INTEGER DEFAULT 0,
  last_retry_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_dead_letters_open
  ON webhook_dead_letters (created_at DESC)
  WHERE resolved_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_dead_letters_event
  ON webhook_dead_letters (provider, event_type, event_id)
  WHERE resolved_at IS NULL;
