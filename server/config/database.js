const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'sms_crm.db'));

function columnExists(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}

function addColumn(table, column, definition) {
  if (!columnExists(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  email TEXT UNIQUE,
  password_hash TEXT,
  role TEXT DEFAULT 'user',
  status TEXT DEFAULT 'active',
  subscription_plan TEXT DEFAULT 'starter',
  message_limit_monthly INTEGER DEFAULT 1000,
  number_limit INTEGER DEFAULT 2,
  subscription_expires_at TEXT,
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
  user_id INTEGER,
  workspace_id INTEGER DEFAULT 1,
  name TEXT,
  phone TEXT,
  country TEXT DEFAULT 'US',
  email TEXT,
  tags TEXT,
  notes TEXT,
  consent_status TEXT DEFAULT 'unknown',
  consent_source TEXT,
  consent_date TEXT,
  is_unsubscribed INTEGER DEFAULT 0,
  unsubscribed_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  contact_id INTEGER,
  workspace_id INTEGER DEFAULT 1,
  phone TEXT,
  status TEXT DEFAULT 'open',
  unread_count INTEGER DEFAULT 0,
  last_message_preview TEXT,
  last_message_at TEXT DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  conversation_id INTEGER,
  contact_id INTEGER,
  direction TEXT DEFAULT 'outbound',
  to_number TEXT,
  from_number TEXT,
  message_body TEXT,
  provider TEXT DEFAULT 'mock',
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

CREATE TABLE IF NOT EXISTS numbers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  workspace_id INTEGER DEFAULT 1,
  provider TEXT DEFAULT 'mock',
  phone_number TEXT,
  country TEXT,
  type TEXT,
  label TEXT,
  status TEXT DEFAULT 'active',
  is_default INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS providers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT,
  label TEXT,
  encrypted_api_key TEXT,
  encrypted_api_secret TEXT,
  encrypted_extra_config TEXT,
  status TEXT DEFAULT 'inactive',
  is_default INTEGER DEFAULT 0,
  created_by INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE,
  plan_name TEXT DEFAULT 'starter',
  status TEXT DEFAULT 'active',
  monthly_message_limit INTEGER DEFAULT 1000,
  number_limit INTEGER DEFAULT 2,
  starts_at TEXT,
  expires_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER,
  target_user_id INTEGER,
  action TEXT,
  details TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS suppression_list (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  phone TEXT,
  reason TEXT,
  source TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
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

CREATE TABLE IF NOT EXISTS replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  workspace_id INTEGER DEFAULT 1,
  contact_id INTEGER,
  from_number TEXT,
  to_number TEXT,
  message_body TEXT,
  provider_message_id TEXT,
  received_at TEXT DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS webhook_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  workspace_id INTEGER DEFAULT 1,
  provider TEXT DEFAULT 'mock',
  event_type TEXT,
  payload TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

addColumn('conversations', 'user_id', 'INTEGER');
addColumn('conversations', 'contact_id', 'INTEGER');
addColumn('conversations', 'workspace_id', 'INTEGER DEFAULT 1');
addColumn('conversations', 'phone', 'TEXT');
addColumn('conversations', 'status', "TEXT DEFAULT 'open'");
addColumn('conversations', 'unread_count', 'INTEGER DEFAULT 0');
addColumn('conversations', 'last_message_preview', 'TEXT');
addColumn('conversations', 'last_message_at', 'TEXT');
addColumn('messages', 'workspace_id', 'INTEGER DEFAULT 1');
addColumn('messages', 'user_id', 'INTEGER');
addColumn('messages', 'conversation_id', 'INTEGER');
addColumn('messages', 'contact_id', 'INTEGER');
addColumn('messages', 'segments', 'INTEGER DEFAULT 1');
addColumn('messages', 'cost_estimate', 'REAL DEFAULT 0');
addColumn('messages', 'sent_at', 'TEXT');
addColumn('messages', 'delivered_at', 'TEXT');
addColumn('messages', 'error_message', 'TEXT');
addColumn('messages', 'is_test', 'INTEGER DEFAULT 0');
addColumn('messages', 'metadata', 'TEXT');
addColumn('contacts', 'user_id', 'INTEGER');
addColumn('contacts', 'workspace_id', 'INTEGER DEFAULT 1');
addColumn('contacts', 'notes', 'TEXT');
addColumn('contacts', 'consent_status', "TEXT DEFAULT 'unknown'");
addColumn('contacts', 'consent_source', 'TEXT');
addColumn('contacts', 'consent_date', 'TEXT');
addColumn('contacts', 'is_unsubscribed', 'INTEGER DEFAULT 0');
addColumn('contacts', 'unsubscribed_at', 'TEXT');
addColumn('numbers', 'user_id', 'INTEGER');
addColumn('numbers', 'workspace_id', 'INTEGER DEFAULT 1');
addColumn('numbers', 'label', 'TEXT');
addColumn('numbers', 'provider', "TEXT DEFAULT 'mock'");
addColumn('numbers', 'status', "TEXT DEFAULT 'active'");
addColumn('numbers', 'is_default', 'INTEGER DEFAULT 0');
addColumn('suppression_list', 'workspace_id', 'INTEGER DEFAULT 1');
addColumn('suppression_list', 'user_id', 'INTEGER');
addColumn('webhook_logs', 'message_id', 'INTEGER');
addColumn('webhook_logs', 'user_id', 'INTEGER');
addColumn('webhook_logs', 'workspace_id', 'INTEGER DEFAULT 1');
addColumn('webhook_logs', 'verified', 'INTEGER DEFAULT 0');

db.prepare('INSERT OR IGNORE INTO workspaces (id, company_name, status, country) VALUES (1, ?, ?, ?)').run(
  'Default Workspace',
  'trial',
  'US'
);

addColumn('users', 'status', "TEXT DEFAULT 'active'");
addColumn('users', 'subscription_plan', "TEXT DEFAULT 'starter'");
addColumn('users', 'message_limit_monthly', 'INTEGER DEFAULT 1000');
addColumn('users', 'number_limit', 'INTEGER DEFAULT 2');
addColumn('users', 'subscription_expires_at', 'TEXT');

module.exports = { db };
