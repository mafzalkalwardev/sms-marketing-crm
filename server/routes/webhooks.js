const express = require('express');
const { db } = require('../config/database');
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
  const contact = findOrCreateContact({ userId, phone: from });
  const conversation = findOrCreateConversation({ userId, contactId: contact.id, inbound: true });
  const stopped = isStop(text);

  if (stopped) {
    db.prepare('INSERT OR IGNORE INTO suppression_list (user_id, workspace_id, phone, reason, source) VALUES (?, ?, ?, ?, ?)').run(userId, 1, from, text.trim().toUpperCase(), 'inbound');
    db.prepare("UPDATE contacts SET is_unsubscribed = 1, consent_status = 'unsubscribed', unsubscribed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(contact.id);
  }

  const insert = db.prepare(
    `INSERT INTO messages (
      user_id, workspace_id, contact_id, conversation_id, direction, to_number, from_number,
      message_body, provider, provider_message_id, status, created_at
    ) VALUES (?, ?, ?, ?, 'inbound', ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(userId, 1, contact.id, conversation.id, to, from, text, provider, messageId, stopped ? 'unsubscribed' : 'delivered');

  db.prepare(
    "UPDATE conversations SET phone = ?, last_message_preview = ?, last_message_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
  ).run(from, text.slice(0, 120), conversation.id);

  return { ok: true, unsubscribed: stopped, conversationId: conversation.id, messageId: insert.lastInsertRowid };
}

function findUserByInboundLine(to) {
  const number = db.prepare(
    "SELECT user_id FROM numbers WHERE phone_number = ? AND status = 'active' ORDER BY is_default DESC, id DESC LIMIT 1"
  ).get(to);
  if (number?.user_id) return db.prepare('SELECT id FROM users WHERE id = ?').get(number.user_id);
  return null;
}

router.post('/inbound', verifyVonageWebhook, async (req, res) => {
  const from = normalizePhone(req.body.from || req.body.msisdn);
  const to = normalizePhone(req.body.to);
  const text = req.body.text || req.body.message || req.body.body || '';
  const messageId = req.body.messageId || req.body['message-id'] || req.body.message_uuid || null;
  if (!from || !to || !text) return res.status(400).json({ error: 'Missing from, to, or text' });

  const user = findUserByInboundLine(to);
  if (!user) {
    db.prepare('INSERT INTO webhook_logs (provider, event_type, payload, verified) VALUES (?, ?, ?, ?)').run(
      'vonage',
      'inbound_unmatched',
      JSON.stringify({ ...req.body, note: 'No SignalMint sender number matched inbound to number.' }),
      req.webhookVerified?.ok ? 1 : 0
    );
    return res.status(200).json({ ok: true, unmatched: true });
  }

  const result = await handleInbound(user.id, from, to, text, messageId, 'vonage');
  db.prepare('INSERT INTO webhook_logs (user_id, provider, event_type, payload, message_id, verified) VALUES (?, ?, ?, ?, ?, ?)').run(
    user.id,
    'vonage',
    'inbound',
    JSON.stringify(req.body),
    result.messageId,
    req.webhookVerified?.ok ? 1 : 0
  );
  res.status(200).json(result);
});

router.post('/status', verifyVonageWebhook, async (req, res) => {
  const messageId = req.body.messageId || req.body['message-id'] || req.body.message_uuid || req.body.message_uuid;
  const status = vonageProvider.mapVonageStatus(req.body.status || req.body.messageStatus || 'unknown');
  const message = messageId ? db.prepare('SELECT * FROM messages WHERE provider_message_id = ?').get(messageId) : null;
  db.prepare('INSERT INTO webhook_logs (user_id, provider, event_type, payload, message_id, verified) VALUES (?, ?, ?, ?, ?, ?)').run(
    message?.user_id || null,
    'vonage',
    'status',
    JSON.stringify(req.body),
    message?.id || null,
    req.webhookVerified?.ok ? 1 : 0
  );
  if (messageId) {
    db.prepare("UPDATE messages SET status = ?, delivered_at = CASE WHEN ? = 'delivered' THEN datetime('now') ELSE delivered_at END, updated_at = datetime('now') WHERE provider_message_id = ?").run(status, status, messageId);
  }
  res.status(200).json({ ok: true });
});

function handlerTwilioInbound(req, res) {
  const from = normalizePhone(req.body.From || req.body.from);
  const to = normalizePhone(req.body.To || req.body.to);
  const text = req.body.Body || req.body.body || '';
  const messageId = req.body.MessageSid || req.body.messageSid || null;
  handleInbound(1, from, to, text, messageId, 'twilio').then((result) => res.status(200).json(result));
}

function handlerTwilioStatus(req, res) {
  const messageId = req.body.MessageSid || req.body.SmsStatus;
  const status = req.body.SmsStatus || 'unknown';
  res.status(200).json({ ok: true });
}

module.exports = { router, handlerTwilioInbound, handlerTwilioStatus };
