const express = require('express');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { findOrCreateConversation, messagePreview } = require('../lib/conversations');
const { normalizePhone, countSegments, estimateCost, sendSms } = require('../lib/sms');

const router = express.Router();
router.use(authenticate);

router.get('/conversations', (req, res) => {
  const workspaceId = req.user.workspace_id || 1;
  const conversations = db.prepare(
    `SELECT c.*, contacts.name, contacts.phone, contacts.email, contacts.tags, contacts.consent_status, contacts.is_unsubscribed
     FROM conversations c
     JOIN contacts ON contacts.id = c.contact_id
     WHERE c.workspace_id = ?
     ORDER BY datetime(c.last_message_at) DESC, c.id DESC`
  ).all(workspaceId).map((conversation) => ({
    ...conversation,
    lastMessage: messagePreview(conversation.id),
  }));
  res.json(conversations);
});

router.get('/conversations/:id/messages', (req, res) => {
  const workspaceId = req.user.workspace_id || 1;
  const conversation = db.prepare('SELECT * FROM conversations WHERE id = ? AND workspace_id = ?').get(req.params.id, workspaceId);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
  db.prepare("UPDATE conversations SET unread_count = 0, updated_at = datetime('now') WHERE id = ?").run(conversation.id);
  const messages = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY datetime(created_at) ASC, id ASC').all(conversation.id);
  res.json(messages);
});

router.post('/conversations/:id/reply', async (req, res, next) => {
  try {
    const workspaceId = req.user.workspace_id || 1;
    const { message, from } = req.body;
    if (!message || !String(message).trim()) return res.status(400).json({ error: 'Message is required' });
    const conversation = db.prepare(
      `SELECT c.*, contacts.phone, contacts.country, contacts.is_unsubscribed
       FROM conversations c JOIN contacts ON contacts.id = c.contact_id
       WHERE c.id = ? AND c.workspace_id = ?`
    ).get(req.params.id, workspaceId);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    if (conversation.is_unsubscribed) return res.status(403).json({ error: 'This contact is unsubscribed.' });

    const to = normalizePhone(conversation.phone);
    const sender = normalizePhone(from || process.env.VONAGE_SENDER_NUMBER || '');
    const provider = await sendSms({ to, from: sender, text: message });
    const segments = countSegments(message);

    db.prepare(
      `INSERT INTO messages (
        workspace_id, contact_id, conversation_id, direction, to_number, from_number,
        message_body, provider, provider_message_id, status, segments, cost_estimate, sent_at
      ) VALUES (?, ?, ?, 'outbound', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(workspaceId, conversation.contact_id, conversation.id, to, sender, message, provider.mode === 'mock' ? 'mock' : 'vonage', provider.messageId, provider.status, segments, estimateCost(segments, conversation.country));
    findOrCreateConversation({ workspaceId, contactId: conversation.contact_id });
    res.json({ ok: true, mode: provider.mode, status: provider.status, messageId: provider.messageId });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
