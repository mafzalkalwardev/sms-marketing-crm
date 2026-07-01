const assert = require('assert');
const {
  MESSAGE_STATUSES,
  MESSAGE_TRANSITIONS,
  CAMPAIGN_TRANSITIONS,
  CONVERSATION_TRANSITIONS,
  CAMPAIGN_STATUSES,
  CONVERSATION_STATUSES,
  canTransition,
  assertTransition,
  isMessageTerminal,
  isCampaignTerminal,
} = require('../domain/states');

function run() {
  assert.strictEqual(canTransition(MESSAGE_TRANSITIONS, MESSAGE_STATUSES.QUEUED, MESSAGE_STATUSES.SENDING), true);
  assert.strictEqual(canTransition(MESSAGE_TRANSITIONS, MESSAGE_STATUSES.SENT_MOCK, MESSAGE_STATUSES.DELIVERED), false);
  assert.strictEqual(isMessageTerminal(MESSAGE_STATUSES.DELIVERED), true);
  assert.strictEqual(isCampaignTerminal(CAMPAIGN_STATUSES.COMPLETED), true);
  assert.strictEqual(
    canTransition(CAMPAIGN_TRANSITIONS, CAMPAIGN_STATUSES.DRAFT, CAMPAIGN_STATUSES.QUEUED),
    true
  );
  assert.strictEqual(
    canTransition(CONVERSATION_TRANSITIONS, CONVERSATION_STATUSES.OPEN, CONVERSATION_STATUSES.ARCHIVED),
    true
  );

  let threw = false;
  try {
    assertTransition(MESSAGE_TRANSITIONS, MESSAGE_STATUSES.DELIVERED, MESSAGE_STATUSES.SENDING, 'message');
  } catch (error) {
    threw = true;
    assert.strictEqual(error.status, 409);
  }
  assert.strictEqual(threw, true);

  console.log('State machine unit tests passed');
}

run();
