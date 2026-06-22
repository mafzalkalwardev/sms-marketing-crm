const bcrypt = require('bcryptjs');
const { db } = require('../config/database');
const { findOrCreateContact, findOrCreateConversation } = require('../lib/conversations');

const adminEmail = 'admin@ftsolutions.local';
const adminPassword = 'password123';
const user1Email = 'user1@demo.local';
const user1Password = 'password123';
const user2Email = 'user2@demo.local';
const user2Password = 'password123';

const adminName = 'SignalMint Admin';
const userName1 = 'Demo User One';
const userName2 = 'Demo User Two';

const contactsByUser = {
  user1: [
    { name: 'Ayesha Khan', phone: '+15550101001', country: 'US', email: 'ayesha@example.com', tags: 'lead,priority', messages: [
      { body: 'Hi Ayesha, this is SignalMint. How can I help you today?', direction: 'outbound' },
      { body: 'Yes, I need help with my order.', direction: 'inbound' },
    ]},
    { name: 'Michael Reed', phone: '+15550101002', country: 'US', email: 'michael@example.com', tags: 'customer', messages: [
      { body: 'Hey Michael, following up on our conversation.', direction: 'outbound' },
      { body: 'Sounds good, I\'ll review it.', direction: 'inbound' },
    ]},
    { name: 'Sofia Patel', phone: '+15550101003', country: 'UK', email: 'sofia@example.co.uk', tags: 'dispatch', messages: [
      { body: 'Sofia, your dispatch is confirmed for Thursday.', direction: 'outbound' },
      { body: 'Perfect, thanks!', direction: 'inbound' },
    ]},
  ],
  user2: [
    { name: 'Daniel Brooks', phone: '+15550101004', country: 'US', email: 'daniel@example.com', tags: 'follow-up', messages: [
      { body: 'Daniel, did you get a chance to see the proposal?', direction: 'outbound' },
      { body: 'Yes, looks great. Let\'s talk Monday.', direction: 'inbound' },
    ]},
    { name: 'Nadia Lewis', phone: '+15550101005', country: 'UK', email: 'nadia@example.co.uk', tags: 'billing', messages: [
      { body: 'Nadia, your invoice is ready.', direction: 'outbound' },
      { body: 'Thank you, I\'ll process it today.', direction: 'inbound' },
    ]},
  ],
};

function upsertUser(email, password, name, role, status) {
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const hash = bcrypt.hashSync(password, 10);
  if (existing) {
    db.prepare('UPDATE users SET name = ?, password_hash = ?, role = ?, status = ? WHERE id = ?').run(name, hash, role, status, existing.id);
    return existing.id;
  }
  return db.prepare('INSERT INTO users (name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?)').run(name, email, hash, role, status).lastInsertRowid;
}

function ensureSubscription(userId, planName) {
  const existing = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(userId);
  if (existing) {
    db.prepare("UPDATE subscriptions SET plan_name = ?, status = ?, updated_at = datetime('now') WHERE id = ?").run(planName, 'active', existing.id);
  } else {
    db.prepare("INSERT INTO subscriptions (user_id, plan_name, status, starts_at) VALUES (?, ?, ?, datetime('now'))").run(userId, planName, 'active');
  }
}

function seedConversations(userId, contactList) {
  contactList.forEach((entry) => {
    let contact = db.prepare('SELECT * FROM contacts WHERE user_id = ? AND phone = ?').get(userId, entry.phone);
    if (!contact) {
      const cid = db.prepare(
        "INSERT INTO contacts (user_id, name, phone, country, email, tags, consent_status, consent_source, consent_date) VALUES (?, ?, ?, ?, ?, ?, 'opted_in', 'demo', datetime('now'))"
      ).run(userId, entry.name, entry.phone, entry.country, entry.email, entry.tags).lastInsertRowid;
      contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(cid);
    }

    const conv = findOrCreateConversation({ userId, contactId: contact.id, inbound: true });
    for (let i = entry.messages.length - 1; i >= 0; i--) {
      const msg = entry.messages[i];
      const isInbound = msg.direction === 'inbound';
      const dir = isInbound ? 'inbound' : 'outbound';
      db.prepare(
        `INSERT INTO messages (user_id, contact_id, conversation_id, direction, to_number, from_number, message_body, provider, status, created_at, sent_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'mock', ?, datetime('now', ?), datetime('now', ?))`
      ).run(
        userId, contact.id, conv.id,
        dir,
        isInbound ? contact.phone : entry.phone,
        isInbound ? '+15550009999' : contact.phone,
        msg.body,
        'delivered',
        `-${(entry.messages.length - i) * 15} minutes`,
        `-${(entry.messages.length - i) * 15} minutes`
      );
    }
  });
}

function seed() {
  const adminId = upsertUser(adminEmail, adminPassword, adminName, 'admin', 'active');
  const user1Id = upsertUser(user1Email, user1Password, userName1, 'user', 'active');
  const user2Id = upsertUser(user2Email, user2Password, userName2, 'user', 'active');

  ensureSubscription(adminId, 'enterprise');
  ensureSubscription(user1Id, 'starter');
  ensureSubscription(user2Id, 'starter');
  db.prepare('UPDATE users SET message_limit_monthly = 5000, number_limit = 10 WHERE id = ?').run(adminId);
  db.prepare('UPDATE users SET message_limit_monthly = 1000, number_limit = 2 WHERE id = ?').run(user1Id);
  db.prepare('UPDATE users SET message_limit_monthly = 1000, number_limit = 2 WHERE id = ?').run(user2Id);

  const numberList = [
    { phone: '+15550109999', label: 'Main line', user: user1Id },
    { phone: '+15550109990', label: 'Support line', user: user1Id },
    { phone: '+15550109988', label: 'Main line', user: user2Id },
    { phone: '+15550109987', label: 'Sales line', user: user2Id },
  ];
  numberList.forEach((num) => {
    const existing = db.prepare('SELECT id FROM numbers WHERE user_id = ? AND phone_number = ?').get(num.user, num.phone);
    if (!existing) {
      db.prepare(
        'INSERT INTO numbers (user_id, phone_number, country, type, label, provider, status, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(num.user, num.phone, 'US', 'long-code', num.label, 'mock', 'active', num.label.includes('Main') ? 1 : 0);
    }
  });

  seedConversations(user1Id, contactsByUser.user1);
  seedConversations(user2Id, contactsByUser.user2);

  console.log(`Seeded demo data.
  Admin: ${adminEmail} / ${adminPassword}
  User1: ${user1Email} / ${user1Password}
  User2: ${user2Email} / ${user2Password}`);
}

seed();
