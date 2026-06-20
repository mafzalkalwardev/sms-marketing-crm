const express = require('express');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const { search = '', country = '', consent = '', unsubscribed = '' } = req.query;
  const params = [req.user.workspace_id || 1];
  let sql = 'SELECT * FROM contacts WHERE workspace_id = ?';
  if (search) {
    sql += ' AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (country) {
    sql += ' AND country = ?';
    params.push(country);
  }
  if (consent) {
    sql += ' AND consent_status = ?';
    params.push(consent);
  }
  if (unsubscribed !== '') {
    sql += ' AND is_unsubscribed = ?';
    params.push(unsubscribed === 'true' ? 1 : 0);
  }
  sql += ' ORDER BY datetime(created_at) DESC, id DESC';
  const contacts = db.prepare(sql).all(...params);
  res.json(contacts);
});

router.post('/', (req, res) => {
  const { name, phone, country, email, tags, consent_status, consent_source } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number is required' });
  const result = db.prepare(
    "INSERT INTO contacts (workspace_id, name, phone, country, email, tags, consent_status, consent_source, consent_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))"
  ).run(req.user.workspace_id || 1, name || '', phone, country || 'US', email || null, tags || '', consent_status || 'unknown', consent_source || 'manual');
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { name, phone, country, email, tags, consent_status, is_unsubscribed } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number is required' });
  db.prepare(
    "UPDATE contacts SET name = ?, phone = ?, country = ?, email = ?, tags = ?, consent_status = ?, is_unsubscribed = ?, updated_at = datetime('now') WHERE id = ? AND workspace_id = ?"
  ).run(name, phone, country, email, tags, consent_status, is_unsubscribed ? 1 : 0, req.params.id, req.user.workspace_id || 1);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM contacts WHERE id = ? AND workspace_id = ?').run(req.params.id, req.user.workspace_id || 1);
  res.json({ ok: true });
});

module.exports = router;
