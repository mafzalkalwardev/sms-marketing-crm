const express = require('express');
const { query, queryOne, queryAll } = require('../../config/database');
const { authenticate, requireAdmin } = require('../../middleware/auth');

const router = express.Router();
router.use(authenticate);
router.use(requireAdmin);

router.get('/users', async (req, res, next) => {
  try {
    const { search = '', role = '', status = '', page = '1', limit = '50' } = req.query;
    let sql = 'SELECT id, name, email, role, status, subscription_plan, message_limit_monthly, number_limit, subscription_expires_at, created_at FROM users WHERE 1=1';
    const params = [];
    let idx = 1;

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

router.put('/users/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['active', 'inactive', 'suspended'].includes(status)) {
      return res.status(400).json({ error: 'Status must be active, inactive, or suspended' });
    }
    const user = await queryOne('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'super_admin') return res.status(403).json({ error: 'Cannot modify super admin accounts' });

    await query('UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2', [status, req.params.id]);
    await query(
      'INSERT INTO audit_logs (actor_user_id, target_user_id, action, details) VALUES ($1, $2, $3, $4::jsonb)',
      [req.user.id, req.params.id, 'user_status_changed', JSON.stringify({ newStatus: status, userName: user.name, userEmail: user.email })]
    );

    res.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, status } });
  } catch (e) {
    next(e);
  }
});

router.put('/users/:id/subscription', async (req, res, next) => {
  try {
    const { plan_name, message_limit_monthly, number_limit, expires_at } = req.body;
    const user = await queryOne('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const updates = [];
    const values = [];
    let idx = 1;

    if (plan_name) {
      updates.push(`subscription_plan = $${idx}`);
      values.push(plan_name);
      idx += 1;
    }
    if (typeof message_limit_monthly === 'number') {
      updates.push(`message_limit_monthly = $${idx}`);
      values.push(message_limit_monthly);
      idx += 1;
    }
    if (typeof number_limit === 'number') {
      updates.push(`number_limit = $${idx}`);
      values.push(number_limit);
      idx += 1;
    }
    if (expires_at) {
      updates.push(`subscription_expires_at = $${idx}`);
      values.push(expires_at);
      idx += 1;
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No subscription fields to update' });

    values.push(req.params.id);
    await query(`UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx}`, values);

    await query(
      'INSERT INTO audit_logs (actor_user_id, target_user_id, action, details) VALUES ($1, $2, $3, $4::jsonb)',
      [req.user.id, req.params.id, 'subscription_updated', JSON.stringify({ userName: user.name, updates: req.body })]
    );

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get('/usage', async (req, res, next) => {
  try {
    const { user_id, from, to, provider = 'all' } = req.query;
    let sql = `
      SELECT
        COALESCE(u.name, 'Unknown') as user_name,
        COALESCE(u.email, '') as user_email,
        COUNT(m.id)::int as message_count,
        COUNT(CASE WHEN m.status LIKE 'sent%' OR m.status = 'delivered' THEN 1 END)::int as delivered_count,
        COUNT(CASE WHEN m.status = 'failed' THEN 1 END)::int as failed_count,
        SUM(m.cost_estimate) as total_cost
      FROM messages m
      LEFT JOIN users u ON u.id = m.user_id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (user_id) {
      sql += ` AND m.user_id = $${idx}`;
      params.push(user_id);
      idx += 1;
    }
    if (from) {
      sql += ` AND m.created_at >= $${idx}`;
      params.push(from);
      idx += 1;
    }
    if (to) {
      sql += ` AND m.created_at <= $${idx}`;
      params.push(to);
      idx += 1;
    }
    if (provider !== 'all') {
      sql += ` AND m.provider = $${idx}`;
      params.push(provider);
      idx += 1;
    } else {
      sql += ` AND m.provider != $${idx}`;
      params.push('mock');
    }

    sql += ' GROUP BY m.user_id, u.name, u.email ORDER BY message_count DESC';

    const usage = await queryAll(sql, params);
    res.json(usage);
  } catch (e) {
    next(e);
  }
});

router.get('/audit-logs', async (req, res, next) => {
  try {
    const { page = '1', limit = '50', actor_id, target_id, action } = req.query;
    let sql = 'SELECT al.*, a.name as actor_name, t.name as target_name FROM audit_logs al LEFT JOIN users a ON a.id = al.actor_user_id LEFT JOIN users t ON t.id = al.target_user_id WHERE 1=1';
    const params = [];
    let idx = 1;

    if (actor_id) {
      sql += ` AND al.actor_user_id = $${idx}`;
      params.push(actor_id);
      idx += 1;
    }
    if (target_id) {
      sql += ` AND al.target_user_id = $${idx}`;
      params.push(target_id);
      idx += 1;
    }
    if (action) {
      sql += ` AND al.action = $${idx}`;
      params.push(action);
      idx += 1;
    }
    sql += ` ORDER BY al.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(Number(limit), (Number(page) - 1) * Number(limit));

    const logs = await queryAll(sql, params);
    res.json(logs);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
