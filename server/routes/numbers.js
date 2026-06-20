const express = require('express');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { isValidPhone, normalizePhone } = require('../lib/sms');

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const numbers = db.prepare('SELECT * FROM numbers WHERE workspace_id = ? ORDER BY is_default DESC, id DESC').all(req.user.workspace_id || 1);
  res.json(numbers);
});

router.post('/', (req, res) => {
  const { phone_number, country, type, provider = 'vonage', is_default = false } = req.body;
  const phone = normalizePhone(phone_number);
  if (!isValidPhone(phone)) return res.status(400).json({ error: 'Phone number must be valid E.164 format' });
  const workspaceId = req.user.workspace_id || 1;
  if (is_default) db.prepare('UPDATE numbers SET is_default = 0 WHERE workspace_id = ?').run(workspaceId);
  const result = db.prepare(
    'INSERT INTO numbers (workspace_id, phone_number, country, type, provider, is_default, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(workspaceId, phone, country || 'US', type || 'long-code', provider, is_default ? 1 : 0, 'active');
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const workspaceId = req.user.workspace_id || 1;
  const existing = db.prepare('SELECT * FROM numbers WHERE id = ? AND workspace_id = ?').get(req.params.id, workspaceId);
  if (!existing) return res.status(404).json({ error: 'Number not found' });
  const phone = normalizePhone(req.body.phone_number || existing.phone_number);
  if (!isValidPhone(phone)) return res.status(400).json({ error: 'Phone number must be valid E.164 format' });
  if (req.body.is_default) db.prepare('UPDATE numbers SET is_default = 0 WHERE workspace_id = ?').run(workspaceId);
  db.prepare(
    "UPDATE numbers SET phone_number = ?, country = ?, type = ?, provider = ?, status = ?, is_default = ?, updated_at = datetime('now') WHERE id = ? AND workspace_id = ?"
  ).run(phone, req.body.country || existing.country, req.body.type || existing.type, req.body.provider || existing.provider, req.body.status || existing.status, req.body.is_default ? 1 : existing.is_default, req.params.id, workspaceId);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM numbers WHERE id = ? AND workspace_id = ?').run(req.params.id, req.user.workspace_id || 1);
  res.json({ ok: true });
});

module.exports = router;
