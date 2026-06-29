const express = require('express');
const { query, queryOne, queryAll, withTransaction } = require('../../config/database');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { search = '', role = '', status = '', page = '1', limit = '50' } = req.query;
    let sql = 'SELECT id, name, email, role, status, subscription_plan, message_limit_monthly, number_limit, subscription_expires_at, managed_by_admin_id, created_at FROM users WHERE role != $1';
    const params = ['super_admin'];
    let idx = 2;

    if (search) {
      sql += ` AND (name ILIKE $${idx} OR email ILIKE $${idx + 1})`;
      params.push(`%${search}%`, `%${search}%`);
      idx += 2;
    }
    if (role) {
      sql += ` AND role = $${idx}`;
      params.push(role);
      idx += 1;
    }
    if (status) {
      sql += ` AND status = $${idx}`;
      params.push(status);
      idx += 1;
    }
    sql += ` ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(Number(limit), (Number(page) - 1) * Number(limit));

    const users = await queryAll(sql, params);
    res.json(users);
  } catch (e) {
    next(e);
  }
});

router.put('/:id/status', async (req, res, next) => {
  try {
    const { status, reason } = req.body;
    if (!['active', 'inactive', 'suspended'].includes(status)) {
      return res.status(400).json({ error: 'Status must be active, inactive, or suspended' });
    }

    const user = await queryOne('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'super_admin') return res.status(403).json({ error: 'Cannot modify super admin accounts' });
    if (user.id === req.user.id) return res.status(403).json({ error: 'Cannot change your own status' });

    let cascadedCount = 0;

    await withTransaction(async (tx) => {
      await tx.query('UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2', [status, user.id]);

      if (user.role === 'admin' && status === 'suspended') {
        const cascade = await tx.query(
          "UPDATE users SET status = 'suspended', updated_at = NOW() WHERE managed_by_admin_id = $1 AND status = 'active' RETURNING id",
          [user.id]
        );
        cascadedCount = cascade.rowCount;
      }

      await tx.query(
        'INSERT INTO audit_logs (actor_user_id, target_user_id, action, details) VALUES ($1, $2, $3, $4::jsonb)',
        [
          req.user.id,
          user.id,
          'user_status_changed',
          JSON.stringify({ newStatus: status, userName: user.name, userEmail: user.email, reason: reason || null, cascadedCount }),
        ]
      );

      if (status === 'suspended' || status === 'active') {
        await tx.query(
          'INSERT INTO suspension_events (actor_user_id, target_user_id, action, reason) VALUES ($1, $2, $3, $4)',
          [req.user.id, user.id, status === 'suspended' ? 'suspended' : 'reactivated', reason || null]
        );
      }
    });

    res.json({
      ok: true,
      user: { id: user.id, name: user.name, email: user.email, status },
      cascadedCount,
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
