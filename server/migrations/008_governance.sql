-- Governance: OTP auth, sessions, impersonation, per-org delivery mode

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS delivery_mode TEXT NOT NULL DEFAULT 'sandbox';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS approved_for_live_at TIMESTAMPTZ;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS approved_for_live_by INTEGER REFERENCES users(id);

CREATE TABLE IF NOT EXISTS verification_codes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verification_codes_user_channel
  ON verification_codes (user_id, channel) WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS org_invite_codes (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  admin_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  max_uses INTEGER,
  use_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_jti TEXT UNIQUE NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  impersonated_by INTEGER REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_jti ON auth_sessions (token_jti) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions (user_id);

CREATE TABLE IF NOT EXISTS impersonation_sessions (
  id SERIAL PRIMARY KEY,
  super_admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auth_session_id INTEGER REFERENCES auth_sessions(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS login_events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  email TEXT,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  ip_address TEXT,
  user_agent TEXT,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_managed_by ON users (managed_by_admin_id);
CREATE INDEX IF NOT EXISTS idx_users_org_role ON users (organization_id, role);

-- Demo org isolation: second admin org for FT Solutions
INSERT INTO organizations (id, name, brand_name, status, delivery_mode)
SELECT 3, 'FT Solutions', 'FT Solutions Text', 'active', 'sandbox'
WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE id = 3);

INSERT INTO workspaces (id, company_name, status, country, organization_id)
SELECT 3, 'FT Solutions Workspace', 'active', 'US', 3
WHERE NOT EXISTS (SELECT 1 FROM workspaces WHERE id = 3);

UPDATE users SET organization_id = 3, workspace_id = 3
WHERE email = 'admin@ftsolutions.local' AND organization_id = 1;

UPDATE organizations SET admin_user_id = (SELECT id FROM users WHERE email = 'admin@ftsolutions.local' LIMIT 1)
WHERE id = 3 AND admin_user_id IS NULL;
