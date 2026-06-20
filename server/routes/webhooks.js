const express = require('express');
const { db } = require('../config/database');

const router = express.Router();

router.use(express.json());

router.post('/vonage/inbound', async (req, res) => {
  const { from, to, text } = req.body;
  if (!from || !text) return res.status(400).send('Missing fields');

  const stopKeywords = ['STOP', 'UNSUBSCRIBE', 'REMOVE', 'CANCEL', 'END', 'QUIT', 'NO'];
  const cleanText = text.trim().toUpperCase();

  if (stopKeywords.includes(cleanText) || cleanText.startsWith('STOP')) {
    db.prepare('INSERT OR IGNORE INTO suppression_list (workspace_id, phone, reason, source) VALUES (1, ?, ?, ?)').run(from, cleanText, 'inbound');
    db.prepare('UPDATE contacts SET is_unsubscribed = 1, unsubscribed_at = datetime("now") WHERE phone = ?').run(from);
  }

  const contact = db.prepare('SELECT * FROM contacts WHERE phone = ?').get(from);
  if (!contact) {
    db.prepare('INSERT INTO contacts (workspace_id, name, phone, is_unsubscribed, consent_status) VALUES (1, ?, ?, ?, ?)').run(from, from, cleanText.startsWith('STOP') || cleanText === 'UNSUBSCRIBE' ? 1 : 0, 'unknown');
  }

  const contactRow = db.prepare('SELECT * FROM contacts WHERE phone = ?').get(from);

  db.prepare(
    'INSERT INTO messages (workspace_id, contact_id, direction, to_number, from_number, message_body, status, created_at) VALUES (1, ?, ?, ?, ?, ?, ?, datetime("now"))'
  ).run(contactRow.id, 'inbound', to, from, text, 'delivered');

  res.status(200).send('OK');
});

router.post('/vonage/status', async (req, res) => {
  const { messageId, status } = req.body;
  if (messageId) {
    db.prepare('UPDATE messages SET status = ? WHERE provider_message_id = ?').run(status, messageId);
  }
  res.status(200).send('OK');
});

module.exports = router;