const express = require('express');
const bcrypt = require('bcryptjs');
const { query, queryOne, queryAll } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/workspace', async (req, res, next) => {
  try {
    const numbers = await queryAll(
      `SELECT id, phone_number, label, country, is_default, status
       FROM numbers WHERE user_id = $1 AND status = 'active'
       ORDER BY is_default DESC, id DESC`,
      [req.user.id]
    );
    const defaultRow = numbers.find((n) => n.is_default) || numbers[0] || null;
    res.json({
      messagingReady: numbers.length > 0,
      defaultLine: defaultRow?.phone_number || null,
      lines: numbers.map((n) => ({
        id: n.id,
        phone: n.phone_number,
        label: n.label || n.phone_number,
        isDefault: Boolean(n.is_default),
        country: n.country || 'US',
      })),
      hint: 'Any assigned business line works — your messages route through the platform dialer automatically.',
    });
  } catch (e) {
    next(e);
  }
});

router.get('/profile', async (req, res, next) => {
  try {
    const user = await queryOne(
      'SELECT id, name, email, role, status, subscription_plan, subscription_expires_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (e) {
    next(e);
  }
});

router.put('/profile', async (req, res, next) => {
  try {
    const { name, email } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });
    await query(
      'UPDATE users SET name = $1, email = $2, updated_at = NOW() WHERE id = $3',
      [name, email.toLowerCase(), req.user.id]
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/change-password', async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) return res.status(400).json({ error: 'Current and new password are required' });
    if (String(new_password).length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });

    const user = await queryOne('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!await bcrypt.compare(current_password, user.password_hash)) return res.status(400).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(new_password, 10);
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, req.user.id]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
