const express = require('express');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { normalizePhone, isValidPhone } = require('../lib/sms');
const { findOrCreateConversation, findOrCreateContact } = require('../lib/conversations');

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const isAdmin = req.user.role === 'admin';
  if (isAdmin) {
    const { user_id } = req.query;
    const numbers = user_id ? db.prepare('SELECT * FROM numbers WHERE user_id = ? ORDER BY is_default DESC, id DESC').all(user_id) : db.prepare('SELECT * FROM numbers ORDER BY is_default DESC, id DESC').all();
    res.json(numbers);
  } else {
    const numbers = db.prepare('SELECT * FROM numbers WHERE user_id = ? ORDER BY is_default DESC, id DESC').all(req.user.id);
    res.json(numbers);
  }
});

router.post('/', (req, res) => {
  const { phone_number, country, type, label, is_default } = req.body;
  const phone = normalizePhone(phone_number);
  if (!isValidPhone(phone)) return res.status(400).json({ error: 'Phone number must be valid E.164 format' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const currentCount = db.prepare('SELECT COUNT(*) as n FROM numbers WHERE user_id = ?').get(req.user.id).n;
  const limit = user.number_limit || 2;
  if (currentCount >= limit && !is_default) {
    return res.status(403).json({ error: `Number limit reached (${limit}). Upgrade your plan to add more.` });
  }

  if (is_default) db.prepare('UPDATE numbers SET is_default = 0 WHERE user_id = ?').run(req.user.id);

  const result = db.prepare(
    'INSERT INTO numbers (user_id, workspace_id, phone_number, country, type, label, provider, status, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, 1, phone, country || 'US', type || 'long-code', label || '', 'mock', 'active', is_default ? 1 : 0);
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { label, status, is_default, phone_number } = req.body;
  const number = db.prepare('SELECT * FROM numbers WHERE id = ?').get(req.params.id);
  if (!number) return res.status(404).json({ error: 'Number not found' });

  const isAdmin = req.user.role === 'admin';
  if (!isAdmin && number.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

  const phone = normalizePhone(phone_number || number.phone_number);
  if (!isValidPhone(phone)) return res.status(400).json({ error: 'Phone number must be valid E.164 format' });
  if (is_default) db.prepare('UPDATE numbers SET is_default = 0 WHERE user_id = ?').run(number.user_id);

  db.prepare(
    "UPDATE numbers SET phone_number = ?, country = ?, type = ?, label = ?, status = ?, is_default = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(phone, req.body.country || number.country, req.body.type || number.type, label || number.label, status || number.status, is_default ? 1 : number.is_default, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const number = db.prepare('SELECT * FROM numbers WHERE id = ?').get(req.params.id);
  if (!number) return res.status(404).json({ error: 'Number not found' });

  const isAdmin = req.user.role === 'admin';
  if (!isAdmin && number.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

  db.prepare('DELETE FROM numbers WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/set-default', (req, res) => {
  const number = db.prepare('SELECT * FROM numbers WHERE id = ?').get(req.params.id);
  if (!number) return res.status(404).json({ error: 'Number not found' });
  if (number.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  db.prepare('UPDATE numbers SET is_default = 0 WHERE user_id = ?').run(number.user_id);
  db.prepare('UPDATE numbers SET is_default = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
