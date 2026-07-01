require('dotenv').config();
const { initDatabase, queryOne, queryAll } = require('../config/database');
const messageStateService = require('../services/messageStateService');
const { MESSAGE_STATUSES } = require('../domain/states');

async function run() {
  await initDatabase();

  const user = await queryOne("SELECT id FROM users WHERE email = 'user1@demo.local'");
  if (!user) throw new Error('Seed user missing — run npm run seed');

  const message = await messageStateService.createOutboundMessage({
    userId: user.id,
    workspaceId: 1,
    organizationId: 1,
    contactId: null,
    conversationId: null,
    toNumber: '+15550001111',
    fromNumber: '+15550009999',
    messageBody: 'Audit integration test',
    provider: 'mock',
    providerId: null,
    segments: 1,
    costEstimate: 0.008,
    actorUserId: user.id,
  });

  await messageStateService.transitionMessage(message.id, MESSAGE_STATUSES.SENDING, {
    source: 'test',
    metadata: { actorUserId: user.id },
  });
  await messageStateService.transitionMessage(message.id, MESSAGE_STATUSES.SENT_MOCK, {
    source: 'test',
    metadata: { actorUserId: user.id },
  });

  const audits = await queryAll(
    `SELECT * FROM audit_logs WHERE action = 'message_status_changed'
     AND details->>'messageId' = $1
     ORDER BY created_at ASC`,
    [String(message.id)]
  );

  if (audits.length < 3) {
    throw new Error(`Expected 3 audit rows, got ${audits.length}`);
  }

  console.log(`Message status audit integration test passed (${audits.length} entries for message #${message.id})`);
}

run().catch((error) => {
  console.error('FAILED:', error.message);
  process.exit(1);
});
