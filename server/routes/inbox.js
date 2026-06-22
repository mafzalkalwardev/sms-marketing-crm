const express = require('express');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { findOrCreateConversation, messagePreview } = require('../lib/conversations');
const { normalizePhone, sendTextMessage } = require('../services/smsService');

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

    const result = await sendTextMessage({
      user: req.user,
      to: conversation.phone,
      from,
      message,
      contactName: conversation.name,
      workspaceId,
    });
    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      mode: result.mode,
      status: result.status,
      providerMessageId: result.providerMessageId,
      message: result.message,
      error: result.error,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
