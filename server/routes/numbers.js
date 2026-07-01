const express = require('express');
const { query, queryOne, queryAll } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { normalizePhone, isValidPhone } = require('../lib/sms');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    let numbers;
    if (isAdmin) {
      const { user_id } = req.query;
      numbers = user_id
        ? await queryAll(
            'SELECT id, user_id, workspace_id, phone_number, country, type, label, status, is_default, created_at, updated_at FROM numbers WHERE user_id = $1 ORDER BY is_default DESC, id DESC',
            [user_id]
          )
        : await queryAll(
            'SELECT id, user_id, workspace_id, phone_number, country, type, label, status, is_default, created_at, updated_at FROM numbers ORDER BY is_default DESC, id DESC'
          );
    } else {
      numbers = await queryAll(
        'SELECT id, user_id, workspace_id, phone_number, country, type, label, status, is_default, created_at, updated_at FROM numbers WHERE user_id = $1 ORDER BY is_default DESC, id DESC',
        [req.user.id]
      );
    }
    res.json(numbers);
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { phone_number, country, type, label, is_default } = req.body;
    const phone = normalizePhone(phone_number);
    if (!isValidPhone(phone)) return res.status(400).json({ error: 'Phone number must be valid E.164 format' });

    const user = await queryOne('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const countRow = await queryOne('SELECT COUNT(*)::int AS n FROM numbers WHERE user_id = $1', [req.user.id]);
    const currentCount = countRow?.n || 0;
    const limit = user.number_limit || 2;
    if (currentCount >= limit && !is_default) {
      return res.status(403).json({ error: `Number limit reached (${limit}). Upgrade your plan to add more.` });
    }

    if (is_default) {
      await query('UPDATE numbers SET is_default = FALSE WHERE user_id = $1', [req.user.id]);
    }

    const result = await query(
      `INSERT INTO numbers (user_id, workspace_id, phone_number, country, type, label, provider, status, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, 'mock', 'active', $7) RETURNING id`,
      [req.user.id, 1, phone, country || 'US', type || 'long-code', label || '', Boolean(is_default)]
    );
    res.json({ id: result.rows[0].id });
  } catch (e) {
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { label, status, is_default, phone_number } = req.body;
    const number = await queryOne('SELECT * FROM numbers WHERE id = $1', [req.params.id]);
    if (!number) return res.status(404).json({ error: 'Number not found' });

    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    if (!isAdmin && number.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    const phone = normalizePhone(phone_number || number.phone_number);
    if (!isValidPhone(phone)) return res.status(400).json({ error: 'Phone number must be valid E.164 format' });
    if (is_default) {
      await query('UPDATE numbers SET is_default = FALSE WHERE user_id = $1', [number.user_id]);
    }

    await query(
      `UPDATE numbers SET phone_number = $1, country = $2, type = $3, label = $4, status = $5,
       is_default = $6, updated_at = NOW() WHERE id = $7`,
      [
        phone,
        req.body.country || number.country,
        req.body.type || number.type,
        label || number.label,
        status || number.status,
        is_default ? true : number.is_default,
        req.params.id,
      ]
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const number = await queryOne('SELECT * FROM numbers WHERE id = $1', [req.params.id]);
    if (!number) return res.status(404).json({ error: 'Number not found' });

    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    if (!isAdmin && number.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    await query('DELETE FROM numbers WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/set-default', async (req, res, next) => {
  try {
    const number = await queryOne('SELECT * FROM numbers WHERE id = $1', [req.params.id]);
    if (!number) return res.status(404).json({ error: 'Number not found' });
    if (number.user_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await query('UPDATE numbers SET is_default = FALSE WHERE user_id = $1', [number.user_id]);
    await query('UPDATE numbers SET is_default = TRUE WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
