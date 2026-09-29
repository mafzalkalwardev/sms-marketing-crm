-- Per-user eSIM profiles + outbound job queue for Android SMS agent

CREATE TABLE IF NOT EXISTS esim_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id INTEGER REFERENCES organizations(id),
  number_id INTEGER REFERENCES numbers(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  encrypted_lpa TEXT,
  qr_image_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending_install',
  agent_device_id TEXT,
  agent_token_hash TEXT,
  pairing_code TEXT,
  pairing_expires_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_esim_profiles_user_phone
  ON esim_profiles (user_id, phone_number)
  WHERE status IS DISTINCT FROM 'disabled';

CREATE INDEX IF NOT EXISTS idx_esim_profiles_pairing
  ON esim_profiles (pairing_code)
  WHERE pairing_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_esim_profiles_agent_token
  ON esim_profiles (agent_token_hash)
  WHERE agent_token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS esim_outbound_jobs (
  id SERIAL PRIMARY KEY,
  profile_id INTEGER NOT NULL REFERENCES esim_profiles(id) ON DELETE CASCADE,
  message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  to_number TEXT NOT NULL,
  from_number TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  claimed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esim_outbound_jobs_pending
  ON esim_outbound_jobs (profile_id, status, id)
  WHERE status = 'pending';

-- Ensure a platform-level eSIM provider row exists for number routing
INSERT INTO providers (provider, label, adapter_type, status, is_default, is_enabled)
SELECT 'esim', 'eSIM Device Agent', 'esim', 'active', FALSE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM providers WHERE provider = 'esim');
