-- Phase 3: browser lane production — selector versions + inbound cursor

ALTER TABLE browser_profiles ADD COLUMN IF NOT EXISTS selector_version TEXT DEFAULT 'v1';
ALTER TABLE browser_profiles ADD COLUMN IF NOT EXISTS inbound_cursor JSONB DEFAULT '{}';
