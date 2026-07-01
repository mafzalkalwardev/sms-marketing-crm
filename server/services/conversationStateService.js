const { query, queryOne } = require('../config/database');
const { CONVERSATION_STATUSES, CONVERSATION_TRANSITIONS, assertTransition } = require('../domain/states');

async function logConversationEvent(conversationId, fromStatus, toStatus, source, actorUserId = null) {
  await query(
    `INSERT INTO conversation_status_events (conversation_id, from_status, to_status, source, actor_user_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [conversationId, fromStatus, toStatus, source, actorUserId]
  );
}

async function getConversation(conversationId) {
  return queryOne('SELECT * FROM conversations WHERE id = $1', [conversationId]);
}

async function transitionConversation(conversationId, toStatus, { source = 'api', actorUserId = null } = {}) {
  const conversation = await getConversation(conversationId);
  if (!conversation) {
    const error = new Error('Conversation not found');
    error.status = 404;
    throw error;
  }

  const fromStatus = conversation.status || CONVERSATION_STATUSES.OPEN;
  if (fromStatus === toStatus) return conversation;

  assertTransition(CONVERSATION_TRANSITIONS, fromStatus, toStatus, 'conversation');

  const updated = await queryOne(
    'UPDATE conversations SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [toStatus, conversationId]
  );

  await logConversationEvent(conversationId, fromStatus, toStatus, source, actorUserId);
  return updated;
}

module.exports = {
  CONVERSATION_STATUSES,
  getConversation,
  transitionConversation,
};
