const express = require('express');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const campaigns = db.prepare('SELECT * FROM campaigns WHERE workspace_id = ?').all(req.user.workspace_id || 1);
  res.json(campaigns);
});

router.post('/', (req, res) => {
  const { title, message_template, send_rate, scheduled_at } = req.body;
  const result = db.prepare(
    'INSERT INTO campaigns (workspace_id, title, message_template, send_rate, scheduled_at, created_by, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(req.user.workspace_id || 1, title, message_template, send_rate || 1, scheduled_at || null, req.user.id, 'draft');
  res.json({ id: result.lastInsertRowid });
});

module.exports = router;