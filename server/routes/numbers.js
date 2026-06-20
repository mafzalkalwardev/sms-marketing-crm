const express = require('express');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const numbers = db.prepare('SELECT * FROM numbers WHERE workspace_id = ?').all(req.user.workspace_id || 1);
  res.json(numbers);
});

router.post('/', (req, res) => {
  const { phone_number, country, type } = req.body;
  const result = db.prepare(
    'INSERT INTO numbers (workspace_id, phone_number, country, type, provider) VALUES (?, ?, ?, ?, ?)'
  ).run(req.user.workspace_id || 1, phone_number, country || 'US', type || 'long-code', 'vonage');
  res.json({ id: result.lastInsertRowid });
});

module.exports = router;