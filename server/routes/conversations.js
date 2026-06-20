const express = require('express');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { findOrCreateContact, findOrCreateConversation, messagePreview } = require('../lib/conversations');
const { normalizePhone, isValidPhone, countSegments, estimateCost, sendSms } = require('../lib/sms');

const router = express.Router();
router.use(authenticate);

function conversationList(workspaceId) {
  return db.prepare(
    `SELECT c.*, contacts.name, contacts.phone, contacts.email, contacts.tags, contacts.consent_status, contacts.is_unsubscribed
     FROM conversations c
     JOIN contacts ON contacts.id = c.contact_id
     WHERE c.workspace_id = ?
     ORDER BY datetime(c.last_message_at) DESC, c.id DESC`
  ).all(workspaceId).map((conversation) => ({
    ...conversation,
    lastMessage: messagePreview(conversation.id),
  }));
}

router.get('/', (req, res) => {
  res.json(conversationList(req.user.workspace_id || 1));
});

router.get('/:id', (req, res) => {
  const workspaceId = req.user.workspace_id || 1;
  const conversation = conversationList(workspaceId).find((row) => row.id === Number(req.params.id));
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
  res.json(conversation);
});

router.get('/:id/messages', (req, res) => {
  const workspaceId = req.user.workspace_id || 1;
  const conversation = db.prepare('SELECT * FROM conversations WHERE id = ? AND workspace_id = ?').get(req.params.id, workspaceId);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
  db.prepare("UPDATE conversations SET unread_count = 0, updated_at = datetime('now') WHERE id = ?").run(conversation.id);
  res.json(db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY datetime(created_at) ASC, id ASC').all(conversation.id));
});

router.post('/start', (req, res) => {
  const workspaceId = req.user.workspace_id || 1;
  const phone = normalizePhone(req.body.phone || req.body.to);
  if (!isValidPhone(phone)) return res.status(400).json({ error: 'Phone must be valid E.164 format' });
  const contact = findOrCreateContact({ workspaceId, phone, name: req.body.name || '', country: req.body.country || 'US' });
  const conversation = findOrCreateConversation({ workspaceId, contactId: contact.id });
  res.json({ ok: true, conversationId: conversation.id, contactId: contact.id });
});

router.post('/:id/messages', async (req, res, next) => {
  try {
    const workspaceId = req.user.workspace_id || 1;
    const message = String(req.body.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Message is required' });
    const conversation = db.prepare(
      `SELECT c.*, contacts.phone, contacts.country, contacts.is_unsubscribed
       FROM conversations c JOIN contacts ON contacts.id = c.contact_id
       WHERE c.id = ? AND c.workspace_id = ?`
    ).get(req.params.id, workspaceId);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    if (conversation.is_unsubscribed) return res.status(403).json({ error: 'This contact is unsubscribed.' });
    const provider = await sendSms({ to: conversation.phone, from: req.body.from || process.env.VONAGE_SENDER_NUMBER || '', text: message });
    const segmentCount = countSegments(message);
    const result = db.prepare(
      `INSERT INTO messages (
        workspace_id, contact_id, conversation_id, direction, to_number, from_number,
        message_body, provider, provider_message_id, status, segments, cost_estimate, sent_at
      ) VALUES (?, ?, ?, 'outbound', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(workspaceId, conversation.contact_id, conversation.id, conversation.phone, req.body.from || '', message, provider.mode === 'mock' ? 'mock' : 'vonage', provider.messageId, provider.status, segmentCount, estimateCost(segmentCount, conversation.country));
    findOrCreateConversation({ workspaceId, contactId: conversation.contact_id });
    const saved = db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid);
    res.json({ ok: true, mode: provider.mode, message: saved });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
