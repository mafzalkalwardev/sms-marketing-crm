const express = require('express');
const { query, queryOne, queryAll } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { messagePreview } = require('../lib/conversations');
const { normalizePhone, sendTextMessage } = require('../services/smsService');
const { sanitizeSendResult } = require('../lib/sanitize');

const router = express.Router();
router.use(authenticate);

router.get('/conversations', async (req, res, next) => {
  try {
    const workspaceId = req.user.workspace_id || 1;
    const conversations = await queryAll(
      `SELECT c.*, contacts.name, contacts.phone, contacts.email, contacts.tags, contacts.consent_status, contacts.is_unsubscribed
       FROM conversations c
       JOIN contacts ON contacts.id = c.contact_id
       WHERE c.workspace_id = $1
       ORDER BY c.last_message_at DESC NULLS LAST, c.id DESC`,
      [workspaceId]
    );
    const enriched = await Promise.all(conversations.map(async (conversation) => ({
      ...conversation,
      lastMessage: await messagePreview(conversation.id),
    })));
    res.json(enriched);
  } catch (e) {
    next(e);
  }
});

router.get('/conversations/:id/messages', async (req, res, next) => {
  try {
    const workspaceId = req.user.workspace_id || 1;
    const conversation = await queryOne(
      'SELECT * FROM conversations WHERE id = $1 AND workspace_id = $2',
      [req.params.id, workspaceId]
    );
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    await query('UPDATE conversations SET unread_count = 0, updated_at = NOW() WHERE id = $1', [conversation.id]);
    const messages = await queryAll(
      'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC, id ASC',
      [conversation.id]
    );
    res.json(messages);
  } catch (e) {
    next(e);
  }
});

router.post('/conversations/:id/reply', async (req, res, next) => {
  try {
    const workspaceId = req.user.workspace_id || 1;
    const { message, from } = req.body;
    if (!message || !String(message).trim()) return res.status(400).json({ error: 'Message is required' });
    const conversation = await queryOne(
      `SELECT c.*, contacts.phone, contacts.country, contacts.is_unsubscribed
       FROM conversations c JOIN contacts ON contacts.id = c.contact_id
       WHERE c.id = $1 AND c.workspace_id = $2`,
      [req.params.id, workspaceId]
    );
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
    res.status(result.ok ? 200 : 502).json(sanitizeSendResult(result));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
