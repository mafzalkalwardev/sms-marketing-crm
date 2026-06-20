const express = require('express');
const { Vonage } = require('@vonage/server-sdk');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const vonage = new Vonage({
  apiKey: process.env.VONAGE_API_KEY,
  apiSecret: process.env.VONAGE_API_SECRET,
});

function countSegments(text) {
  const len = Buffer.byteLength(text, 'utf8');
  if (len <= 160) return 1;
  return Math.ceil(len / 153);
}

function isUnsubscribed(phone) {
  const row = db.prepare('SELECT * FROM suppression_list WHERE phone = ?').get(phone);
  return !!row;
}

router.post('/send', async (req, res) => {
  const { to, message, from } = req.body;
  if (!to || !message) return res.status(400).json({ error: 'Missing fields' });
  if (isUnsubscribed(to)) return res.status(403).json({ error: 'This number is unsubscribed.' });

  const sender = from || process.env.VONAGE_SENDER_NUMBER || '';
  const segments = countSegments(message);

  try {
    await vonage.sms.send({
      to,
      from: sender,
      text: message,
    });

    db.prepare(
      'INSERT INTO messages (workspace_id, direction, to_number, from_number, message_body, segments, status, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime("now"))'
    ).run(req.user.workspace_id || 1, 'outbound', to, sender, message, segments, 'sent');

    res.json({ ok: true });
  } catch (e) {
    db.prepare(
      'INSERT INTO messages (workspace_id, direction, to_number, from_number, message_body, segments, status, error_message, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime("now"))'
    ).run(req.user.workspace_id || 1, 'outbound', to, sender, message, segments, 'failed', e.message);
    res.status(500).json({ error: 'Failed to send SMS', details: e.message });
  }
});

module.exports = router;