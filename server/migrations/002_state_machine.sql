-- State machine support: audit trail, campaign recipients, campaign stats

CREATE TABLE IF NOT EXISTS message_status_events (
  id SERIAL PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'system',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_message_status_events_message_id ON message_status_events(message_id);

CREATE TABLE IF NOT EXISTS campaign_recipients (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  message_id INTEGER REFERENCES messages(id),
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(campaign_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign_id ON campaign_recipients(campaign_id);

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS stats_json JSONB DEFAULT '{}';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS from_number TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS user_id INTEGER;

CREATE TABLE IF NOT EXISTS campaign_status_events (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'system',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversation_status_events (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'system',
  actor_user_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
