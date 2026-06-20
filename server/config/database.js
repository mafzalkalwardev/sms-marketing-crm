const Database = require('better-sqlite3');
const db = new Database('sms_crm.db');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  email TEXT UNIQUE,
  password_hash TEXT,
  role TEXT DEFAULT 'agent',
  workspace_id INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workspaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_name TEXT DEFAULT 'Default Workspace',
  owner_id INTEGER,
  status TEXT DEFAULT 'trial',
  country TEXT DEFAULT 'US',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER DEFAULT 1,
  name TEXT,
  phone TEXT,
  country TEXT DEFAULT 'US',
  email TEXT,
  tags TEXT,
  consent_status TEXT DEFAULT 'unknown',
  consent_source TEXT,
  consent_date TEXT,
  is_unsubscribed INTEGER DEFAULT 0,
  unsubscribed_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER DEFAULT 1,
  title TEXT,
  message_template TEXT,
  status TEXT DEFAULT 'draft',
  send_rate INTEGER DEFAULT 1,
  scheduled_at TEXT,
  created_by INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER DEFAULT 1,
  campaign_id INTEGER,
  contact_id INTEGER,
  direction TEXT DEFAULT 'outbound',
  to_number TEXT,
  from_number TEXT,
  message_body TEXT,
  provider TEXT DEFAULT 'vonage',
  provider_message_id TEXT,
  status TEXT DEFAULT 'queued',
  segments INTEGER DEFAULT 1,
  cost_estimate REAL DEFAULT 0,
  error_message TEXT,
  sent_at TEXT,
  delivered_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER DEFAULT 1,
  contact_id INTEGER,
  from_number TEXT,
  to_number TEXT,
  message_body TEXT,
  provider_message_id TEXT,
  received_at TEXT DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER DEFAULT 1,
  contact_id INTEGER,
  assigned_to INTEGER,
  status TEXT DEFAULT 'open',
  last_message_at TEXT DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS numbers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER DEFAULT 1,
  provider TEXT DEFAULT 'vonage',
  phone_number TEXT,
  country TEXT,
  type TEXT,
  status TEXT DEFAULT 'active',
  is_default INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS suppression_list (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER DEFAULT 1,
  phone TEXT UNIQUE,
  reason TEXT,
  source TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS webhook_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER DEFAULT 1,
  provider TEXT DEFAULT 'vonage',
  event_type TEXT,
  payload TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

module.exports = { db };