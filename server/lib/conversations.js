const { db } = require('../config/database');

function findOrCreateContact({ userId = 1, phone, name = '', country = 'US', workspaceId = 1 }) {
  let contact = db.prepare('SELECT * FROM contacts WHERE user_id = ? AND phone = ?').get(userId, phone);
  if (contact) return contact;

  const result = db.prepare(
    "INSERT INTO contacts (user_id, workspace_id, name, phone, country, consent_status, consent_source, consent_date) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))"
  ).run(userId, workspaceId, name || phone, phone, country, 'unknown', 'system');

  return db.prepare('SELECT * FROM contacts WHERE id = ?').get(result.lastInsertRowid);
}

function getConversation(userId, contactId) {
  return db.prepare('SELECT * FROM conversations WHERE user_id = ? AND contact_id = ?').get(userId, contactId);
}

function findOrCreateConversation({ userId = 1, contactId, inbound = false, workspaceId = 1 }) {
  let conversation = getConversation(userId, contactId);
  if (!conversation) {
    const result = db.prepare(
      "INSERT INTO conversations (user_id, workspace_id, contact_id, status, unread_count, last_message_at) VALUES (?, ?, ?, ?, ?, datetime('now'))"
    ).run(userId, workspaceId, contactId, 'open', inbound ? 1 : 0);
    conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(result.lastInsertRowid);
  } else {
    db.prepare(
      "UPDATE conversations SET last_message_at = datetime('now'), unread_count = unread_count + ?, updated_at = datetime('now') WHERE id = ?"
    ).run(inbound ? 1 : 0, conversation.id);
    conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversation.id);
  }
  return conversation;
}

function messagePreview(conversationId) {
  const message = db.prepare(
    'SELECT message_body, created_at, status FROM messages WHERE conversation_id = ? ORDER BY datetime(created_at) DESC, id DESC LIMIT 1'
  ).get(conversationId);
  return message || null;
}

function isSuppressed(userId, phone) {
  const suppressed = db.prepare('SELECT id FROM suppression_list WHERE user_id = ? AND phone = ?').get(userId, phone);
  const contact = db.prepare('SELECT id FROM contacts WHERE user_id = ? AND phone = ? AND is_unsubscribed = 1').get(userId, phone);
  return Boolean(suppressed || contact);
}

module.exports = {
  findOrCreateContact,
  findOrCreateConversation,
  messagePreview,
  isSuppressed,
  getConversation,
};
