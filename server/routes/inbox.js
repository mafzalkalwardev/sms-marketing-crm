const express = require('express');
const { query, queryOne, queryAll } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { messagePreview } = require('../lib/conversations');
const { normalizePhone, sendTextMessage } = require('../services/smsService');
const { sanitizeSendResult } = require('../lib/sanitize');
const { conversationScopeClause } = require('../lib/orgScope');
const { resolveTenancy } = require('../services/tenancyService');

const router = express.Router();
router.use(authenticate);

router.get('/conversations', async (req, res, next) => {
  try {
    let sql = `SELECT c.*, contacts.name, contacts.phone, contacts.email, contacts.tags, contacts.consent_status, contacts.is_unsubscribed
       FROM conversations c
       JOIN contacts ON contacts.id = c.contact_id
       WHERE 1=1`;
    const params = [];
    const scope = conversationScopeClause(req.user, 'c', 1);
    sql += scope.clause;
    params.push(...scope.params);
    sql += ' ORDER BY c.last_message_at DESC NULLS LAST, c.id DESC';

    const conversations = await queryAll(sql, params);
    const enriched = await Promise.all(conversations.map(async (conversation) => ({
      ...conversation,
      lastMessage: await messagePreview(conversation.id),
    })));
    res.json(enriched);
  } catch (e) {
    next(e);
  }
});

async function getScopedConversation(conversationId, actor) {
  let sql = `SELECT c.*, contacts.name, contacts.phone, contacts.country, contacts.is_unsubscribed
     FROM conversations c JOIN contacts ON contacts.id = c.contact_id
     WHERE c.id = $1`;
  const params = [conversationId];
  const scope = conversationScopeClause(actor, 'c', 2);
  sql += scope.clause;
  params.push(...scope.params);
  return queryOne(sql, params);
}

router.get('/conversations/:id/messages', async (req, res, next) => {
  try {
    const conversation = await getScopedConversation(req.params.id, req.user);
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
    const { message, from } = req.body;
    if (!message || !String(message).trim()) return res.status(400).json({ error: 'Message is required' });
    const conversation = await getScopedConversation(req.params.id, req.user);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    if (conversation.is_unsubscribed) return res.status(403).json({ error: 'This contact is unsubscribed.' });

    const { workspaceId } = await resolveTenancy(req.user);
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
