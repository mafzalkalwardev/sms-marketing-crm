const express = require('express');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/conversations', (req, res) => {
  const contacts = db.prepare('SELECT * FROM contacts WHERE workspace_id = ?').all(req.user.workspace_id || 1);
  const conversations = contacts.map(c => ({
    contact_id: c.id,
    name: c.name,
    phone: c.phone,
    status: 'open',
  }));
  res.json(conversations);
});

router.post('/conversations/:contactId/reply', (req, res) => {
  const { message, from } = req.body;
  const contactId = req.params.contactId;
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ? AND workspace_id = ?').get(contactId, req.user.workspace_id || 1);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });

  db.prepare(
    'INSERT INTO messages (workspace_id, contact_id, direction, to_number, from_number, message_body, status, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime("now"))'
  ).run(req.user.workspace_id || 1, contactId, 'outbound', contact.phone, from || '', message, 'sent');

  res.json({ ok: true });
});

module.exports = router;