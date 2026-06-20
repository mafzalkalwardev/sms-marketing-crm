const express = require('express');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const contacts = db.prepare('SELECT * FROM contacts WHERE workspace_id = ?').all(req.user.workspace_id || 1);
  res.json(contacts);
});

router.post('/', (req, res) => {
  const { name, phone, country, email, tags, consent_status, consent_source } = req.body;
  const result = db.prepare(
    'INSERT INTO contacts (workspace_id, name, phone, country, email, tags, consent_status, consent_source, consent_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime("now"))'
  ).run(req.user.workspace_id || 1, name || '', phone, country || 'US', email || null, tags || '', consent_status || 'unknown', consent_source || null);
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { name, phone, country, email, tags, consent_status, is_unsubscribed } = req.body;
  db.prepare(
    'UPDATE contacts SET name = ?, phone = ?, country = ?, email = ?, tags = ?, consent_status = ?, is_unsubscribed = ?, updated_at = datetime("now") WHERE id = ? AND workspace_id = ?'
  ).run(name, phone, country, email, tags, consent_status, is_unsubscribed ? 1 : 0, req.params.id, req.user.workspace_id || 1);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM contacts WHERE id = ? AND workspace_id = ?').run(req.params.id, req.user.workspace_id || 1);
  res.json({ ok: true });
});

module.exports = router;