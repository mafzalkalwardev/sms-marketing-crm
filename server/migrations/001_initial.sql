-- SignalMint PostgreSQL schema v1

CREATE TABLE IF NOT EXISTS organizations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Default Organization',
  admin_user_id INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  organization_id INTEGER REFERENCES organizations(id),
  managed_by_admin_id INTEGER,
  subscription_plan TEXT DEFAULT 'starter',
  message_limit_monthly INTEGER DEFAULT 1000,
  number_limit INTEGER DEFAULT 2,
  subscription_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspaces (
  id SERIAL PRIMARY KEY,
  company_name TEXT DEFAULT 'Default Workspace',
  owner_id INTEGER,
  organization_id INTEGER REFERENCES organizations(id),
  status TEXT DEFAULT 'trial',
  country TEXT DEFAULT 'US',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS providers (
  id SERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  label TEXT,
  adapter_type TEXT NOT NULL DEFAULT 'api',
  encrypted_api_key TEXT,
  encrypted_api_secret TEXT,
  encrypted_extra_config TEXT,
  organization_id INTEGER REFERENCES organizations(id),
  capabilities_json JSONB DEFAULT '{}',
  rate_limit_per_second INTEGER DEFAULT 1,
  status TEXT DEFAULT 'inactive',
  is_default BOOLEAN DEFAULT FALSE,
  is_enabled BOOLEAN DEFAULT TRUE,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS browser_profiles (
  id SERIAL PRIMARY KEY,
  provider_id INTEGER REFERENCES providers(id),
  organization_id INTEGER REFERENCES organizations(id),
  adapter_id TEXT NOT NULL,
  engine TEXT NOT NULL DEFAULT 'playwright_persistent',
  profile_path_encrypted TEXT,
  base_url TEXT,
  selector_json JSONB DEFAULT '{}',
  session_status TEXT DEFAULT 'logged_out',
  poll_interval_seconds INTEGER DEFAULT 15,
  rate_limit_per_second INTEGER DEFAULT 1,
  daily_cap INTEGER,
  is_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contacts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  workspace_id INTEGER DEFAULT 1,
  organization_id INTEGER REFERENCES organizations(id),
  name TEXT,
  phone TEXT NOT NULL,
  country TEXT DEFAULT 'US',
  email TEXT,
  tags TEXT,
  notes TEXT,
  consent_status TEXT DEFAULT 'unknown',
  consent_source TEXT,
  consent_date TIMESTAMPTZ,
  is_unsubscribed BOOLEAN DEFAULT FALSE,
  unsubscribed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  contact_id INTEGER,
  workspace_id INTEGER DEFAULT 1,
  organization_id INTEGER REFERENCES organizations(id),
  phone TEXT,
  status TEXT DEFAULT 'open',
  unread_count INTEGER DEFAULT 0,
  last_message_preview TEXT,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  workspace_id INTEGER DEFAULT 1,
  organization_id INTEGER REFERENCES organizations(id),
  conversation_id INTEGER,
  contact_id INTEGER,
  campaign_id INTEGER,
  direction TEXT DEFAULT 'outbound',
  to_number TEXT,
  from_number TEXT,
  message_body TEXT,
  provider TEXT DEFAULT 'mock',
  provider_id INTEGER REFERENCES providers(id),
  provider_message_id TEXT,
  status TEXT DEFAULT 'queued',
  segments INTEGER DEFAULT 1,
  cost_estimate REAL DEFAULT 0,
  error_message TEXT,
  internal_error_code TEXT,
  idempotency_key TEXT UNIQUE,
  is_test BOOLEAN DEFAULT FALSE,
  metadata JSONB,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS numbers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  workspace_id INTEGER DEFAULT 1,
  organization_id INTEGER REFERENCES organizations(id),
  provider_id INTEGER REFERENCES providers(id),
  provider TEXT DEFAULT 'mock',
  provider_number_sid TEXT,
  phone_number TEXT NOT NULL,
  country TEXT,
  type TEXT,
  label TEXT,
  status TEXT DEFAULT 'active',
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS suppression_list (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  workspace_id INTEGER DEFAULT 1,
  organization_id INTEGER REFERENCES organizations(id),
  phone TEXT NOT NULL,
  reason TEXT,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaigns (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  workspace_id INTEGER DEFAULT 1,
  organization_id INTEGER REFERENCES organizations(id),
  title TEXT,
  message_template TEXT,
  status TEXT DEFAULT 'draft',
  send_rate INTEGER DEFAULT 1,
  scheduled_at TIMESTAMPTZ,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE,
  plan_name TEXT DEFAULT 'starter',
  status TEXT DEFAULT 'active',
  monthly_message_limit INTEGER DEFAULT 1000,
  number_limit INTEGER DEFAULT 2,
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  actor_user_id INTEGER,
  target_user_id INTEGER,
  action TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS suspension_events (
  id SERIAL PRIMARY KEY,
  actor_user_id INTEGER,
  target_user_id INTEGER,
  action TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webhook_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  workspace_id INTEGER DEFAULT 1,
  provider TEXT DEFAULT 'mock',
  event_type TEXT,
  payload JSONB,
  message_id INTEGER,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id SERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  provider_message_id TEXT,
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_provider_message_id ON messages(provider_message_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_user_phone ON contacts(user_id, phone);
CREATE INDEX IF NOT EXISTS idx_numbers_phone ON numbers(phone_number);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);

INSERT INTO organizations (id, name, status)
SELECT 1, 'Default Organization', 'active'
WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE id = 1);

INSERT INTO workspaces (id, company_name, status, country, organization_id)
SELECT 1, 'Default Workspace', 'trial', 'US', 1
WHERE NOT EXISTS (SELECT 1 FROM workspaces WHERE id = 1);
