require('dotenv').config();
const { initDatabase } = require('../config/database');
const webhookProcessor = require('../services/webhookProcessor');
const {
  recordDeadLetter,
  listDeadLetters,
  retryDeadLetter,
} = require('../services/webhookDeadLetterService');

async function run() {
  await initDatabase();

  const stamp = Date.now();
  const body = { messageId: `dl_${stamp}`, status: 'delivered', eventId: `explicit_dl_${stamp}` };
  const eventId = webhookProcessor.buildEventId('mock', body, 'status');

  const id = await recordDeadLetter({
    provider: 'mock',
    eventType: 'status',
    eventId,
    payload: body,
    errorMessage: 'simulated processing failure',
    verified: true,
  });

  const open = await listDeadLetters({ limit: 10, provider: 'mock' });
  if (!open.find((row) => row.id === id)) {
    throw new Error('Dead letter not listed');
  }

  const result = await retryDeadLetter(id);
  if (!result.ok) {
    throw new Error(`Retry failed: ${JSON.stringify(result)}`);
  }

  const after = await listDeadLetters({ limit: 10, provider: 'mock' });
  if (after.find((row) => row.id === id)) {
    throw new Error('Dead letter was not resolved after retry');
  }

  console.log('Webhook dead-letter replay test passed');
}

run().catch((error) => {
  console.error('FAILED:', error.message);
  process.exit(1);
});
