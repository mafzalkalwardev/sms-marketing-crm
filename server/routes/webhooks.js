const express = require('express');
const { db } = require('../config/database');
const { findOrCreateContact, findOrCreateConversation } = require('../lib/conversations');
const { normalizePhone } = require('../lib/sms');

const router = express.Router();
router.use(express.json());

const stopKeywords = ['STOP', 'UNSUBSCRIBE', 'REMOVE', 'CANCEL', 'END', 'QUIT', 'NO', "DON'T TEXT ME", 'PLEASE REMOVE ME'];

function isStop(text) {
  const clean = String(text || '').trim().toUpperCase();
  return stopKeywords.includes(clean) || clean.startsWith('STOP ');
}

router.post('/inbound', async (req, res) => {
  const from = normalizePhone(req.body.from || req.body.msisdn);
  const to = normalizePhone(req.body.to);
  const text = req.body.text || req.body.message || '';
  const messageId = req.body.messageId || req.body['message-id'] || req.body.message_uuid || null;
  if (!from || !text) return res.status(400).json({ error: 'Missing from or text' });

  db.prepare('INSERT INTO webhook_logs (workspace_id, provider, event_type, payload) VALUES (?, ?, ?, ?)').run(1, 'vonage', 'inbound', JSON.stringify(req.body));

  const contact = findOrCreateContact({ workspaceId: 1, phone: from });
  const conversation = findOrCreateConversation({ workspaceId: 1, contactId: contact.id, inbound: true });
  const stopped = isStop(text);

  if (stopped) {
    db.prepare('INSERT OR IGNORE INTO suppression_list (workspace_id, phone, reason, source) VALUES (1, ?, ?, ?)').run(from, text.trim().toUpperCase(), 'inbound');
    db.prepare("UPDATE contacts SET is_unsubscribed = 1, consent_status = 'unsubscribed', unsubscribed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(contact.id);
  }

  db.prepare(
    `INSERT INTO messages (
      workspace_id, contact_id, conversation_id, direction, to_number, from_number,
      message_body, provider, provider_message_id, status, created_at
    ) VALUES (1, ?, ?, 'inbound', ?, ?, ?, 'vonage', ?, ?, datetime('now'))`
  ).run(contact.id, conversation.id, to, from, text, messageId, stopped ? 'unsubscribed' : 'delivered');

  res.status(200).json({ ok: true, unsubscribed: stopped, conversationId: conversation.id });
});

router.post('/status', async (req, res) => {
  const messageId = req.body.messageId || req.body['message-id'] || req.body.message_uuid;
  const status = req.body.status || req.body.messageStatus || 'unknown';
  db.prepare('INSERT INTO webhook_logs (workspace_id, provider, event_type, payload) VALUES (?, ?, ?, ?)').run(1, 'vonage', 'status', JSON.stringify(req.body));
  if (messageId) {
    db.prepare("UPDATE messages SET status = ?, delivered_at = CASE WHEN ? = 'delivered' THEN datetime('now') ELSE delivered_at END, updated_at = datetime('now') WHERE provider_message_id = ?").run(status, status, messageId);
  }
  res.status(200).json({ ok: true });
});

module.exports = router;
