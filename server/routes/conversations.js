const express = require('express');
const { query, queryOne, queryAll } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { sendTextMessage, normalizePhone, isValidPhone } = require('../services/smsService');
const { messagePreview } = require('../lib/conversations');
const { sanitizeSendResult, sanitizeMessages } = require('../lib/sanitize');
const { CONVERSATION_STATUSES, transitionConversation } = require('../services/conversationStateService');
const { conversationScopeClause } = require('../lib/orgScope');
const { resolveTenancy } = require('../services/tenancyService');

const router = express.Router();

async function conversationList(actor) {
  let sql = `SELECT c.*, contacts.name, contacts.phone, contacts.email, contacts.tags, contacts.consent_status, contacts.is_unsubscribed
     FROM conversations c
     JOIN contacts ON contacts.id = c.contact_id
     WHERE 1=1`;
  const params = [];
  let idx = 1;
  const scope = conversationScopeClause(actor, 'c', idx);
  sql += scope.clause;
  params.push(...scope.params);
  sql += ' ORDER BY c.last_message_at DESC NULLS LAST, c.id DESC';

  const rows = await queryAll(sql, params);
  return Promise.all(rows.map(async (conversation) => ({
    ...conversation,
    lastMessage: await messagePreview(conversation.id),
  })));
}

router.get('/', authenticate, async (req, res, next) => {
  try {
    res.json(await conversationList(req.user));
  } catch (e) {
    next(e);
  }
});

router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const conversations = await conversationList(req.user);
    const conversation = conversations.find((row) => row.id === Number(req.params.id));
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    res.json(conversation);
  } catch (e) {
    next(e);
  }
});

router.get('/:id/messages', authenticate, async (req, res, next) => {
  try {
    const conversations = await conversationList(req.user);
    const conversation = conversations.find((row) => row.id === Number(req.params.id));
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    await query('UPDATE conversations SET unread_count = 0, updated_at = NOW() WHERE id = $1', [conversation.id]);
    const messages = await queryAll(
      'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC, id ASC',
      [conversation.id]
    );
    res.json(sanitizeMessages(messages));
  } catch (e) {
    next(e);
  }
});

router.post('/start', authenticate, async (req, res, next) => {
  try {
    const { to, phone, name, from, from_number, message } = req.body;
    const phoneNorm = normalizePhone(to || phone);
    if (!isValidPhone(phoneNorm)) return res.status(400).json({ error: 'Phone must be valid E.164 format' });

    const userId = req.user.id;
    const { organizationId, workspaceId } = await resolveTenancy(req.user);

    let contact = await queryOne('SELECT * FROM contacts WHERE user_id = $1 AND phone = $2', [userId, phoneNorm]);
    if (!contact) {
      const result = await query(
        `INSERT INTO contacts (user_id, workspace_id, organization_id, name, phone, country, consent_status, consent_source, consent_date)
         VALUES ($1, $2, $3, $4, $5, $6, 'unknown', 'manual', NOW()) RETURNING *`,
        [userId, workspaceId, organizationId, name || phoneNorm, phoneNorm, 'US']
      );
      contact = result.rows[0];
    }

    let conversation = await queryOne(
      'SELECT * FROM conversations WHERE user_id = $1 AND contact_id = $2',
      [userId, contact.id]
    );
    if (!conversation) {
      const result = await query(
        `INSERT INTO conversations (user_id, workspace_id, organization_id, contact_id, phone, status, unread_count, last_message_at)
         VALUES ($1, $2, $3, $4, $5, 'open', 0, NOW()) RETURNING *`,
        [userId, workspaceId, organizationId, contact.id, phoneNorm]
      );
      conversation = result.rows[0];
    }

    let sendResult = null;
    if (message && String(message).trim()) {
      sendResult = await sendTextMessage({
        user: req.user,
        to: phoneNorm,
        from: from || from_number,
        message,
        contactName: name,
        workspaceId,
        organizationId,
      });
      conversation = await queryOne('SELECT * FROM conversations WHERE id = $1', [sendResult.conversation.id]);
    }

    if (sendResult) {
      res.json({ ...sanitizeSendResult(sendResult), conversation, contact });
    } else {
      res.json({ ok: true, conversation, conversationId: conversation.id, contact });
    }
  } catch (e) {
    next(e);
  }
});

router.post('/:id/messages', authenticate, async (req, res, next) => {
  try {
    const conversations = await conversationList(req.user);
    const conversation = conversations.find((row) => row.id === Number(req.params.id));
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    if (conversation.is_unsubscribed) return res.status(403).json({ error: 'This contact is unsubscribed.' });

    const message = String(req.body.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Message is required' });

    const { workspaceId } = await resolveTenancy(req.user);
    const result = await sendTextMessage({
      user: req.user,
      to: conversation.phone,
      from: req.body.from,
      message,
      contactName: conversation.name,
      workspaceId,
    });

    res.status(result.ok ? 200 : 502).json(sanitizeSendResult(result));
  } catch (error) {
    next(error);
  }
});

async function transitionOwnedConversation(req, res, next, toStatus) {
  try {
    const conversations = await conversationList(req.user);
    const conversation = conversations.find((row) => row.id === Number(req.params.id));
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    const updated = await transitionConversation(conversation.id, toStatus, {
      source: 'api',
      actorUserId: req.user.id,
    });
    res.json(updated);
  } catch (error) {
    next(error);
  }
}

router.post('/:id/archive', authenticate, (req, res, next) => {
  transitionOwnedConversation(req, res, next, CONVERSATION_STATUSES.ARCHIVED);
});

router.post('/:id/close', authenticate, (req, res, next) => {
  transitionOwnedConversation(req, res, next, CONVERSATION_STATUSES.CLOSED);
});

router.post('/:id/reopen', authenticate, (req, res, next) => {
  transitionOwnedConversation(req, res, next, CONVERSATION_STATUSES.OPEN);
});

module.exports = router;
