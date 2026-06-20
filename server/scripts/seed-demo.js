const bcrypt = require('bcryptjs');
const { db } = require('../config/database');
const { findOrCreateContact, findOrCreateConversation } = require('../lib/conversations');

const workspaceId = 1;
const userEmail = 'admin@ftsolutions.local';
const password = 'password123';

const contacts = [
  { name: 'Ayesha Khan', phone: '+15550101001', country: 'US', email: 'ayesha@example.com', tags: 'lead, priority' },
  { name: 'Michael Reed', phone: '+15550101002', country: 'US', email: 'michael@example.com', tags: 'customer' },
  { name: 'Sofia Patel', phone: '+15550101003', country: 'UK', email: 'sofia@example.co.uk', tags: 'dispatch' },
  { name: 'Daniel Brooks', phone: '+15550101004', country: 'US', email: 'daniel@example.com', tags: 'follow-up' },
  { name: 'Nadia Lewis', phone: '+15550101005', country: 'UK', email: 'nadia@example.co.uk', tags: 'billing' },
];

function upsertUser() {
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(userEmail);
  const hash = bcrypt.hashSync(password, 10);
  if (existing) {
    db.prepare('UPDATE users SET name = ?, password_hash = ?, role = ?, workspace_id = ? WHERE id = ?').run('SignalMint Demo Admin', hash, 'owner', workspaceId, existing.id);
    return existing.id;
  }
  return db.prepare('INSERT INTO users (name, email, password_hash, role, workspace_id) VALUES (?, ?, ?, ?, ?)').run('SignalMint Demo Admin', userEmail, hash, 'owner', workspaceId).lastInsertRowid;
}

function seed() {
  const userId = upsertUser();
  db.prepare('INSERT OR IGNORE INTO workspaces (id, company_name, owner_id, status, country) VALUES (?, ?, ?, ?, ?)').run(workspaceId, 'FT Solutions', userId, 'trial', 'US');
  db.prepare('DELETE FROM numbers WHERE workspace_id = ? AND phone_number = ?').run(workspaceId, '+15550009999');
  db.prepare('INSERT INTO numbers (workspace_id, provider, phone_number, country, type, status, is_default) VALUES (?, ?, ?, ?, ?, ?, ?)').run(workspaceId, 'mock', '+15550009999', 'US', 'long-code', 'active', 1);

  contacts.forEach((row, index) => {
    let contact = db.prepare('SELECT * FROM contacts WHERE workspace_id = ? AND phone = ?').get(workspaceId, row.phone);
    if (!contact) {
      const id = db.prepare(
        "INSERT INTO contacts (workspace_id, name, phone, country, email, tags, consent_status, consent_source, consent_date) VALUES (?, ?, ?, ?, ?, ?, 'opted_in', 'demo', datetime('now'))"
      ).run(workspaceId, row.name, row.phone, row.country, row.email, row.tags).lastInsertRowid;
      contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
    }
    const conversation = findOrCreateConversation({ workspaceId, contactId: contact.id, inbound: index % 2 === 0 });
    const existingMessages = db.prepare('SELECT COUNT(*) as n FROM messages WHERE conversation_id = ?').get(conversation.id).n;
    if (!existingMessages) {
      db.prepare(
        `INSERT INTO messages (workspace_id, contact_id, conversation_id, direction, to_number, from_number, message_body, provider, provider_message_id, status, created_at, sent_at)
         VALUES (?, ?, ?, 'outbound', ?, '+15550009999', ?, 'mock', ?, 'delivered', datetime('now', '-2 hours'), datetime('now', '-2 hours'))`
      ).run(workspaceId, contact.id, conversation.id, contact.phone, `Hi ${contact.name.split(' ')[0]}, this is FT Solutions. Can I help with anything today?`, `seed_out_${contact.id}`);
      db.prepare(
        `INSERT INTO messages (workspace_id, contact_id, conversation_id, direction, to_number, from_number, message_body, provider, provider_message_id, status, created_at)
         VALUES (?, ?, ?, 'inbound', '+15550009999', ?, ?, 'vonage', ?, 'delivered', datetime('now', '-90 minutes'))`
      ).run(workspaceId, contact.id, conversation.id, contact.phone, index % 2 === 0 ? 'Yes, please send the details.' : 'Thanks, I will review this.', `seed_in_${contact.id}`);
    }
  });
}

seed();
console.log(`Seeded demo data. Login: ${userEmail} / ${password}`);
