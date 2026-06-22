const express = require('express');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/profile', (req, res) => {
  const user = db.prepare('SELECT id, name, email, role, status, subscription_plan, subscription_expires_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

router.put('/profile', (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });
  db.prepare("UPDATE users SET name = ?, email = ?, updated_at = datetime('now') WHERE id = ?").run(name, email.toLowerCase(), req.user.id);
  res.json({ ok: true });
});

router.post('/change-password', async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'Current and new password are required' });
  if (String(new_password).length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const bcrypt = require('bcryptjs');
  if (!await bcrypt.compare(current_password, user.password_hash)) return res.status(400).json({ error: 'Current password is incorrect' });

  const hash = await bcrypt.hash(new_password, 10);
  db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(hash, req.user.id);
  res.json({ ok: true });
});

module.exports = router;
