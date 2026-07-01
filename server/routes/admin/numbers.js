const express = require('express');
const { query, queryOne, queryAll } = require('../../config/database');
const { authenticate, requireAdmin } = require('../../middleware/auth');

const router = express.Router();
router.use(authenticate);
router.use(requireAdmin);

router.get('/', async (req, res, next) => {
  try {
    const numbers = await queryAll(`
      SELECT n.*, u.name as user_name, u.email as user_email
      FROM numbers n
      LEFT JOIN users u ON u.id = n.user_id
      ORDER BY n.created_at DESC, n.id DESC
    `);
    res.json(numbers);
  } catch (e) {
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { status, is_default, user_id } = req.body;
    const number = await queryOne('SELECT * FROM numbers WHERE id = $1', [req.params.id]);
    if (!number) return res.status(404).json({ error: 'Number not found' });

    if (status) {
      await query('UPDATE numbers SET status = $1, updated_at = NOW() WHERE id = $2', [status, req.params.id]);
    }
    if (typeof is_default === 'boolean') {
      await query('UPDATE numbers SET is_default = FALSE WHERE user_id = $1', [number.user_id]);
      await query('UPDATE numbers SET is_default = TRUE WHERE id = $1', [req.params.id]);
    }
    if (user_id) {
      await query('UPDATE numbers SET user_id = $1, updated_at = NOW() WHERE id = $2', [user_id, req.params.id]);
    }

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
