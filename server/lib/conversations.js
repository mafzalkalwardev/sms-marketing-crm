const { queryOne, query } = require('../config/database');

async function findOrCreateContact({ userId = 1, phone, name = '', country = 'US', workspaceId = 1, organizationId = 1 }) {
  let contact = await queryOne('SELECT * FROM contacts WHERE user_id = $1 AND phone = $2', [userId, phone]);
  if (contact) return contact;

  const result = await query(
    `INSERT INTO contacts (user_id, workspace_id, organization_id, name, phone, country, consent_status, consent_source, consent_date)
     VALUES ($1, $2, $3, $4, $5, $6, 'unknown', 'system', NOW()) RETURNING *`,
    [userId, workspaceId, organizationId, name || phone, phone, country]
  );
  return result.rows[0];
}

async function getConversation(userId, contactId) {
  return queryOne('SELECT * FROM conversations WHERE user_id = $1 AND contact_id = $2', [userId, contactId]);
}

async function findOrCreateConversation({ userId = 1, contactId, inbound = false, workspaceId = 1, organizationId = 1 }) {
  let conversation = await getConversation(userId, contactId);
  if (!conversation) {
    const result = await query(
      `INSERT INTO conversations (user_id, workspace_id, organization_id, contact_id, status, unread_count, last_message_at)
       VALUES ($1, $2, $3, $4, 'open', $5, NOW()) RETURNING *`,
      [userId, workspaceId, organizationId, contactId, inbound ? 1 : 0]
    );
    return result.rows[0];
  }

  await query(
    `UPDATE conversations SET last_message_at = NOW(), unread_count = unread_count + $1, updated_at = NOW() WHERE id = $2`,
    [inbound ? 1 : 0, conversation.id]
  );
  return queryOne('SELECT * FROM conversations WHERE id = $1', [conversation.id]);
}

async function messagePreview(conversationId) {
  return queryOne(
    'SELECT message_body, created_at, status FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1',
    [conversationId]
  );
}

async function isSuppressed(userId, phone) {
  const suppressed = await queryOne('SELECT id FROM suppression_list WHERE user_id = $1 AND phone = $2', [userId, phone]);
  const contact = await queryOne(
    'SELECT id FROM contacts WHERE user_id = $1 AND phone = $2 AND is_unsubscribed = TRUE',
    [userId, phone]
  );
  return Boolean(suppressed || contact);
}

module.exports = {
  findOrCreateContact,
  findOrCreateConversation,
  messagePreview,
  isSuppressed,
  getConversation,
};
