const express = require('express');
const { query, queryOne } = require('../config/database');
const { findOrCreateContact, findOrCreateConversation } = require('../lib/conversations');
const { normalizePhone } = require('../services/smsService');
const verifyVonageWebhook = require('../middleware/verifyVonageWebhook');
const vonageProvider = require('../services/providers/vonageProvider');

const router = express.Router();
router.use(express.json());

const stopKeywords = ['STOP', 'UNSUBSCRIBE', 'REMOVE', 'CANCEL', 'END', 'QUIT', 'NO', "DON'T TEXT ME", 'PLEASE REMOVE ME'];

function isStop(text) {
  const clean = String(text || '').trim().toUpperCase();
  return stopKeywords.includes(clean) || clean.startsWith('STOP ');
}

async function handleInbound(userId, from, to, text, messageId, provider) {
  const contact = await findOrCreateContact({ userId, phone: from });
  const conversation = await findOrCreateConversation({ userId, contactId: contact.id, inbound: true });
  const stopped = isStop(text);

  if (stopped) {
    await query(
      `INSERT INTO suppression_list (user_id, workspace_id, phone, reason, source)
       SELECT $1, $2, $3, $4, $5
       WHERE NOT EXISTS (SELECT 1 FROM suppression_list WHERE user_id = $1 AND phone = $3)`,
      [userId, 1, from, text.trim().toUpperCase(), 'inbound']
    );
    await query(
      "UPDATE contacts SET is_unsubscribed = TRUE, consent_status = 'unsubscribed', unsubscribed_at = NOW(), updated_at = NOW() WHERE id = $1",
      [contact.id]
    );
  }

  const insert = await query(
    `INSERT INTO messages (
      user_id, workspace_id, contact_id, conversation_id, direction, to_number, from_number,
      message_body, provider, provider_message_id, status, created_at
    ) VALUES ($1, $2, $3, $4, 'inbound', $5, $6, $7, $8, $9, $10, NOW()) RETURNING id`,
    [userId, 1, contact.id, conversation.id, to, from, text, provider, messageId, stopped ? 'unsubscribed' : 'delivered']
  );

  await query(
    'UPDATE conversations SET phone = $1, last_message_preview = $2, last_message_at = NOW(), updated_at = NOW() WHERE id = $3',
    [from, text.slice(0, 120), conversation.id]
  );

  return { ok: true, unsubscribed: stopped, conversationId: conversation.id, messageId: insert.rows[0].id };
}

async function findUserByInboundLine(to) {
  const number = await queryOne(
    "SELECT user_id FROM numbers WHERE phone_number = $1 AND status = 'active' ORDER BY is_default DESC, id DESC LIMIT 1",
    [to]
  );
  if (number?.user_id) {
    return queryOne('SELECT id FROM users WHERE id = $1', [number.user_id]);
  }
  return null;
}

router.post('/inbound', verifyVonageWebhook, async (req, res, next) => {
  try {
    const from = normalizePhone(req.body.from || req.body.msisdn);
    const to = normalizePhone(req.body.to);
    const text = req.body.text || req.body.message || req.body.body || '';
    const messageId = req.body.messageId || req.body['message-id'] || req.body.message_uuid || null;
    if (!from || !to || !text) return res.status(400).json({ error: 'Missing from, to, or text' });

    const user = await findUserByInboundLine(to);
    if (!user) {
      await query(
        'INSERT INTO webhook_logs (provider, event_type, payload, verified) VALUES ($1, $2, $3::jsonb, $4)',
        [
          'vonage',
          'inbound_unmatched',
          JSON.stringify({ ...req.body, note: 'No SignalMint sender number matched inbound to number.' }),
          Boolean(req.webhookVerified?.ok),
        ]
      );
      return res.status(200).json({ ok: true, unmatched: true });
    }

    const result = await handleInbound(user.id, from, to, text, messageId, 'vonage');
    await query(
      'INSERT INTO webhook_logs (user_id, provider, event_type, payload, message_id, verified) VALUES ($1, $2, $3, $4::jsonb, $5, $6)',
      [user.id, 'vonage', 'inbound', JSON.stringify(req.body), result.messageId, Boolean(req.webhookVerified?.ok)]
    );
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
});

router.post('/status', verifyVonageWebhook, async (req, res, next) => {
  try {
    const messageId = req.body.messageId || req.body['message-id'] || req.body.message_uuid;
    const status = vonageProvider.mapVonageStatus(req.body.status || req.body.messageStatus || 'unknown');
    const message = messageId
      ? await queryOne('SELECT * FROM messages WHERE provider_message_id = $1', [messageId])
      : null;
    await query(
      'INSERT INTO webhook_logs (user_id, provider, event_type, payload, message_id, verified) VALUES ($1, $2, $3, $4::jsonb, $5, $6)',
      [message?.user_id || null, 'vonage', 'status', JSON.stringify(req.body), message?.id || null, Boolean(req.webhookVerified?.ok)]
    );
    if (messageId) {
      await query(
        "UPDATE messages SET status = $1, delivered_at = CASE WHEN $1 = 'delivered' THEN NOW() ELSE delivered_at END, updated_at = NOW() WHERE provider_message_id = $2",
        [status, messageId]
      );
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    next(e);
  }
});

async function handlerTwilioInbound(req, res, next) {
  try {
    const from = normalizePhone(req.body.From || req.body.from);
    const to = normalizePhone(req.body.To || req.body.to);
    const text = req.body.Body || req.body.body || '';
    const messageId = req.body.MessageSid || req.body.messageSid || null;
    if (!from || !to) return res.status(400).json({ error: 'Missing from or to' });

    const user = await findUserByInboundLine(to);
    if (!user) {
      await query(
        'INSERT INTO webhook_logs (provider, event_type, payload, verified) VALUES ($1, $2, $3::jsonb, $4)',
        ['twilio', 'inbound_unmatched', JSON.stringify(req.body), false]
      );
      return res.status(200).json({ ok: true, unmatched: true });
    }

    const result = await handleInbound(user.id, from, to, text, messageId, 'twilio');
    await query(
      'INSERT INTO webhook_logs (user_id, provider, event_type, payload, message_id, verified) VALUES ($1, $2, $3, $4::jsonb, $5, $6)',
      [user.id, 'twilio', 'inbound', JSON.stringify(req.body), result.messageId, false]
    );
    res.status(200).json(result);
  } catch (e) {
    next(e);
  }
}

async function handlerTwilioStatus(req, res, next) {
  try {
    const messageId = req.body.MessageSid || req.body.SmsSid;
    const status = req.body.MessageStatus || req.body.SmsStatus || 'unknown';
    const message = messageId
      ? await queryOne('SELECT * FROM messages WHERE provider_message_id = $1', [messageId])
      : null;
    await query(
      'INSERT INTO webhook_logs (user_id, provider, event_type, payload, message_id, verified) VALUES ($1, $2, $3, $4::jsonb, $5, $6)',
      [message?.user_id || null, 'twilio', 'status', JSON.stringify(req.body), message?.id || null, false]
    );
    if (messageId) {
      await query(
        "UPDATE messages SET status = $1, delivered_at = CASE WHEN $1 = 'delivered' THEN NOW() ELSE delivered_at END, updated_at = NOW() WHERE provider_message_id = $2",
        [status, messageId]
      );
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    next(e);
  }
}

module.exports = { router, handlerTwilioInbound, handlerTwilioStatus };
