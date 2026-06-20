const express = require('express');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { findOrCreateContact, findOrCreateConversation } = require('../lib/conversations');
const { normalizePhone, isValidPhone, countSegments, estimateCost, sendSms } = require('../lib/sms');

const router = express.Router();
router.use(authenticate);

function isSuppressed(workspaceId, phone) {
  const suppressed = db.prepare('SELECT id FROM suppression_list WHERE workspace_id = ? AND phone = ?').get(workspaceId, phone);
  const contact = db.prepare('SELECT id FROM contacts WHERE workspace_id = ? AND phone = ? AND is_unsubscribed = 1').get(workspaceId, phone);
  return Boolean(suppressed || contact);
}

router.post('/send', async (req, res, next) => {
  try {
    const workspaceId = req.user.workspace_id || 1;
    const to = normalizePhone(req.body.to);
    const from = normalizePhone(req.body.from || process.env.VONAGE_SENDER_NUMBER || '');
    const message = String(req.body.message || '').trim();

    if (!isValidPhone(to)) return res.status(400).json({ error: 'Recipient must be a valid E.164 number, for example +15551234567' });
    if (!message) return res.status(400).json({ error: 'Message is required' });
    if (isSuppressed(workspaceId, to)) return res.status(403).json({ error: 'This number is unsubscribed or suppressed.' });

    const contact = findOrCreateContact({ workspaceId, phone: to, country: req.body.country || 'US' });
    const conversation = findOrCreateConversation({ workspaceId, contactId: contact.id });
    const segments = countSegments(message);
    const cost = estimateCost(segments, contact.country);
    const provider = await sendSms({ to, from, text: message });

    db.prepare(
      `INSERT INTO messages (
        workspace_id, contact_id, conversation_id, direction, to_number, from_number,
        message_body, provider, provider_message_id, status, segments, cost_estimate, sent_at
      ) VALUES (?, ?, ?, 'outbound', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(workspaceId, contact.id, conversation.id, to, from, message, provider.mode === 'mock' ? 'mock' : 'vonage', provider.messageId, provider.status, segments, cost);

    res.json({
      ok: true,
      mode: provider.mode,
      messageId: provider.messageId,
      status: provider.status,
      segments,
      costEstimate: cost,
      conversationId: conversation.id,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/history/:phone', (req, res) => {
  const workspaceId = req.user.workspace_id || 1;
  const phone = normalizePhone(req.params.phone);
  const rows = db.prepare(
    `SELECT * FROM messages
     WHERE workspace_id = ? AND (to_number = ? OR from_number = ?)
     ORDER BY datetime(created_at) ASC, id ASC`
  ).all(workspaceId, phone, phone);
  res.json(rows);
});

module.exports = router;
