const bcrypt = require('bcryptjs');
const { query, queryOne } = require('../config/database');
const { findOrCreateConversation } = require('../lib/conversations');

const adminEmail = 'admin@ftsolutions.local';
const adminPassword = 'password123';
const superAdminEmail = 'super_admin@signalmint.local';
const superAdminPassword = 'password123';
const user1Email = 'user1@demo.local';
const user1Password = 'password123';
const user2Email = 'user2@demo.local';
const user2Password = 'password123';

const adminName = 'SignalMint Admin';
const superAdminName = 'SignalMint Super Admin';
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

async function upsertUser(email, password, name, role, status, extras = {}) {
  const existing = await queryOne('SELECT * FROM users WHERE email = $1', [email]);
  const hash = bcrypt.hashSync(password, 10);
  const organizationId = extras.organization_id ?? 1;
  const managedBy = extras.managed_by_admin_id ?? null;
  if (existing) {
    await query(
      `UPDATE users SET name = $1, password_hash = $2, role = $3, status = $4,
       organization_id = $5, managed_by_admin_id = $6, updated_at = NOW() WHERE id = $7`,
      [name, hash, role, status, organizationId, managedBy, existing.id]
    );
    return existing.id;
  }
  const result = await query(
    `INSERT INTO users (name, email, password_hash, role, status, organization_id, managed_by_admin_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [name, email, hash, role, status, organizationId, managedBy]
  );
  return result.rows[0].id;
}

async function ensureSubscription(userId, planName) {
  const existing = await queryOne('SELECT * FROM subscriptions WHERE user_id = $1', [userId]);
  if (existing) {
    await query(
      "UPDATE subscriptions SET plan_name = $1, status = 'active', updated_at = NOW() WHERE id = $2",
      [planName, existing.id]
    );
  } else {
    await query(
      "INSERT INTO subscriptions (user_id, plan_name, status, starts_at) VALUES ($1, $2, 'active', NOW())",
      [userId, planName]
    );
  }
}

async function seedConversations(userId, contactList) {
  for (const entry of contactList) {
    let contact = await queryOne('SELECT * FROM contacts WHERE user_id = $1 AND phone = $2', [userId, entry.phone]);
    if (!contact) {
      const result = await query(
        `INSERT INTO contacts (user_id, name, phone, country, email, tags, consent_status, consent_source, consent_date)
         VALUES ($1, $2, $3, $4, $5, $6, 'opted_in', 'demo', NOW()) RETURNING *`,
        [userId, entry.name, entry.phone, entry.country, entry.email, entry.tags]
      );
      contact = result.rows[0];
    }

    const conv = await findOrCreateConversation({ userId, contactId: contact.id, inbound: true });
    for (let i = entry.messages.length - 1; i >= 0; i--) {
      const msg = entry.messages[i];
      const isInbound = msg.direction === 'inbound';
      const dir = isInbound ? 'inbound' : 'outbound';
      const minutesAgo = (entry.messages.length - i) * 15;
      await query(
        `INSERT INTO messages (user_id, contact_id, conversation_id, direction, to_number, from_number, message_body, provider, status, created_at, sent_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'mock', 'delivered', NOW() - ($8 || ' minutes')::interval, NOW() - ($8 || ' minutes')::interval)`,
        [
          userId,
          contact.id,
          conv.id,
          dir,
          isInbound ? contact.phone : entry.phone,
          isInbound ? '+15550009999' : contact.phone,
          msg.body,
          String(minutesAgo),
        ]
      );
    }
  }
}

async function seed() {
  const superAdminId = await upsertUser(superAdminEmail, superAdminPassword, superAdminName, 'super_admin', 'active');
  const adminId = await upsertUser(adminEmail, adminPassword, adminName, 'admin', 'active');
  const user1Id = await upsertUser(user1Email, user1Password, userName1, 'user', 'active', { managed_by_admin_id: null });
  const user2Id = await upsertUser(user2Email, user2Password, userName2, 'user', 'active', { managed_by_admin_id: null });

  await query('UPDATE users SET managed_by_admin_id = $1 WHERE id = ANY($2::int[])', [adminId, [user1Id, user2Id]]);

  await ensureSubscription(superAdminId, 'enterprise');
  await ensureSubscription(adminId, 'enterprise');
  await ensureSubscription(user1Id, 'starter');
  await ensureSubscription(user2Id, 'starter');

  await query('UPDATE users SET message_limit_monthly = 5000, number_limit = 10 WHERE id = $1', [adminId]);
  await query('UPDATE users SET message_limit_monthly = 1000, number_limit = 2 WHERE id = $1', [user1Id]);
  await query('UPDATE users SET message_limit_monthly = 1000, number_limit = 2 WHERE id = $1', [user2Id]);

  const numberList = [
    { phone: '+15550109999', label: 'Main line', user: user1Id },
    { phone: '+15550109990', label: 'Support line', user: user1Id },
    { phone: '+15550109988', label: 'Main line', user: user2Id },
    { phone: '+15550109987', label: 'Sales line', user: user2Id },
  ];
  for (const num of numberList) {
    const existing = await queryOne('SELECT id FROM numbers WHERE user_id = $1 AND phone_number = $2', [num.user, num.phone]);
    if (!existing) {
      await query(
        `INSERT INTO numbers (user_id, phone_number, country, type, label, provider, status, is_default)
         VALUES ($1, $2, 'US', 'long-code', $3, 'mock', 'active', $4)`,
        [num.user, num.phone, num.label, num.label.includes('Main')]
      );
    }
  }

  await seedConversations(user1Id, contactsByUser.user1);
  await seedConversations(user2Id, contactsByUser.user2);

  console.log(`Seeded demo data.
  Super Admin: ${superAdminEmail} / ${superAdminPassword}
  Admin: ${adminEmail} / ${adminPassword}
  User1: ${user1Email} / ${user1Password}
  User2: ${user2Email} / ${user2Password}`);
}

if (require.main === module) {
  seed().catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}

module.exports = { seed };
