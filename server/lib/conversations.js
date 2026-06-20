const { db } = require('../config/database');

function findOrCreateContact({ workspaceId = 1, phone, name = '', country = 'US' }) {
  let contact = db.prepare('SELECT * FROM contacts WHERE workspace_id = ? AND phone = ?').get(workspaceId, phone);
  if (contact) return contact;

  const result = db.prepare(
    "INSERT INTO contacts (workspace_id, name, phone, country, consent_status, consent_source, consent_date) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))"
  ).run(workspaceId, name || phone, phone, country, 'unknown', 'system');

  return db.prepare('SELECT * FROM contacts WHERE id = ?').get(result.lastInsertRowid);
}

function getConversation(workspaceId, contactId) {
  return db.prepare('SELECT * FROM conversations WHERE workspace_id = ? AND contact_id = ?').get(workspaceId, contactId);
}

function findOrCreateConversation({ workspaceId = 1, contactId, inbound = false }) {
  let conversation = getConversation(workspaceId, contactId);
  if (!conversation) {
    const result = db.prepare(
      "INSERT INTO conversations (workspace_id, contact_id, status, unread_count, last_message_at) VALUES (?, ?, 'open', ?, datetime('now'))"
    ).run(workspaceId, contactId, inbound ? 1 : 0);
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

module.exports = {
  findOrCreateContact,
  findOrCreateConversation,
  messagePreview,
};
