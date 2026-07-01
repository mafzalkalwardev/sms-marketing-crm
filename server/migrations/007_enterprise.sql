-- Phase 7: multi-org tenancy, branding, API keys, retention

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS brand_name TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS primary_color TEXT DEFAULT '#2563eb';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS support_email TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS message_retention_days INTEGER;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS hipaa_mode BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE users ADD COLUMN IF NOT EXISTS workspace_id INTEGER REFERENCES workspaces(id);

UPDATE users u
SET workspace_id = w.id
FROM workspaces w
WHERE u.workspace_id IS NULL
  AND w.organization_id = COALESCE(u.organization_id, 1)
  AND w.id = (
    SELECT MIN(w2.id) FROM workspaces w2 WHERE w2.organization_id = COALESCE(u.organization_id, 1)
  );

UPDATE organizations
SET brand_name = COALESCE(brand_name, name)
WHERE brand_name IS NULL;

INSERT INTO organizations (id, name, brand_name, status)
SELECT 2, 'Acme Field Services', 'Acme Text', 'active'
WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE id = 2);

INSERT INTO workspaces (id, company_name, status, country, organization_id)
SELECT 2, 'Acme Workspace', 'active', 'US', 2
WHERE NOT EXISTS (SELECT 1 FROM workspaces WHERE id = 2);

CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['contacts:read', 'messages:send'],
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys (key_prefix) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_org ON users (organization_id);
CREATE INDEX IF NOT EXISTS idx_users_workspace ON users (workspace_id);
