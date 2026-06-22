const express = require('express');
const { db } = require('../../config/database');
const { authenticate, requireAdmin } = require('../../middleware/auth');

const router = express.Router();
router.use(authenticate);
router.use(requireAdmin);

router.get('/', (req, res) => {
  const numbers = db.prepare(`
    SELECT n.*, u.name as user_name, u.email as user_email
    FROM numbers n
    LEFT JOIN users u ON u.id = n.user_id
    ORDER BY datetime(n.created_at) DESC, n.id DESC
  `).all();
  res.json(numbers);
});

router.put('/:id', (req, res) => {
  const { status, is_default, user_id } = req.body;
  const number = db.prepare('SELECT * FROM numbers WHERE id = ?').get(req.params.id);
  if (!number) return res.status(404).json({ error: 'Number not found' });

  if (status) db.prepare("UPDATE numbers SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, req.params.id);
  if (typeof is_default === 'boolean') {
    db.prepare('UPDATE numbers SET is_default = 0 WHERE user_id = ?').run(number.user_id);
    db.prepare('UPDATE numbers SET is_default = 1 WHERE id = ?').run(req.params.id);
  }
  if (user_id) db.prepare('UPDATE numbers SET user_id = ?, updated_at = datetime("now") WHERE id = ?').run(user_id, req.params.id);

  res.json({ ok: true });
});

module.exports = router;
