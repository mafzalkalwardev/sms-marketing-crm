const express = require('express');
const { db } = require('../../config/database');
const { authenticate, requireAdmin } = require('../../middleware/auth');

const router = express.Router();
router.use(authenticate);
router.use(requireAdmin);

router.get('/users', (req, res) => {
  const { search = '', role = '', status = '', page = '1', limit = '50' } = req.query;
  let sql = 'SELECT id, name, email, role, status, subscription_plan, message_limit_monthly, number_limit, subscription_expires_at, created_at FROM users WHERE 1=1';
  const params = [];

  if (search) {
    sql += ' AND (name LIKE ? OR email LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  if (role) { sql += ' AND role = ?'; params.push(role); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY datetime(created_at) DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), (Number(page) - 1) * Number(limit));

  const users = db.prepare(sql).all(...params);
  res.json(users);
});

router.put('/users/:id/status', (req, res) => {
  const { status } = req.body;
  if (!['active', 'inactive', 'suspended'].includes(status)) {
    return res.status(400).json({ error: 'Status must be active, inactive, or suspended' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.prepare("UPDATE users SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, req.params.id);
  db.prepare('INSERT INTO audit_logs (actor_user_id, target_user_id, action, details) VALUES (?, ?, ?, ?)').run(
    req.user.id, req.params.id, 'user_status_changed', JSON.stringify({ newStatus: status, userName: user.name, userEmail: user.email })
  );

  res.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, status } });
});

router.put('/users/:id/subscription', (req, res) => {
  const { plan_name, status, message_limit_monthly, number_limit, expires_at } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const updates = [];
  const values = [];
  if (plan_name) { updates.push('subscription_plan = ?'); values.push(plan_name); }
  if (typeof message_limit_monthly === 'number') { updates.push('message_limit_monthly = ?'); values.push(message_limit_monthly); }
  if (typeof number_limit === 'number') { updates.push('number_limit = ?'); values.push(number_limit); }
  if (expires_at) { updates.push('subscription_expires_at = ?'); values.push(expires_at); }

  if (updates.length === 0) return res.status(400).json({ error: 'No subscription fields to update' });

  values.push(req.params.id);
  db.prepare(`UPDATE users SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...values);

  db.prepare('INSERT INTO audit_logs (actor_user_id, target_user_id, action, details) VALUES (?, ?, ?, ?)').run(
    req.user.id, req.params.id, 'subscription_updated', JSON.stringify({ userName: user.name, updates: req.body })
  );

  res.json({ ok: true });
});

router.get('/usage', (req, res) => {
  const { user_id, from, to, provider = 'all' } = req.query;
  let sql = `
    SELECT
      COALESCE(u.name, 'Unknown') as user_name,
      COALESCE(u.email, '') as user_email,
      COUNT(m.id) as message_count,
      COUNT(CASE WHEN m.status LIKE 'sent%' OR m.status = 'delivered' THEN 1 END) as delivered_count,
      COUNT(CASE WHEN m.status = 'failed' THEN 1 END) as failed_count,
      SUM(m.cost_estimate) as total_cost
    FROM messages m
    LEFT JOIN users u ON u.id = m.user_id
    WHERE 1=1
  `;
  const params = [];

  if (user_id) { sql += ' AND m.user_id = ?'; params.push(user_id); }
  if (from) { sql += ' AND datetime(m.created_at) >= ?'; params.push(from); }
  if (to) { sql += ' AND datetime(m.created_at) <= ?'; params.push(to); }
  if (provider !== 'all') { sql += ' AND m.provider = ?'; params.push(provider); }
  else { sql += ' AND m.provider != ?'; params.push('mock'); }

  sql += ' GROUP BY m.user_id ORDER BY message_count DESC';

  const usage = db.prepare(sql).all(...params);
  res.json(usage);
});

router.get('/audit-logs', (req, res) => {
  const { page = '1', limit = '50', actor_id, target_id, action } = req.query;
  let sql = 'SELECT al.*, a.name as actor_name, t.name as target_name FROM audit_logs al LEFT JOIN users a ON a.id = al.actor_user_id LEFT JOIN users t ON t.id = al.target_user_id WHERE 1=1';
  const params = [];

  if (actor_id) { sql += ' AND al.actor_user_id = ?'; params.push(actor_id); }
  if (target_id) { sql += ' AND al.target_user_id = ?'; params.push(target_id); }
  if (action) { sql += ' AND al.action = ?'; params.push(action); }
  sql += ' ORDER BY datetime(al.created_at) DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), (Number(page) - 1) * Number(limit));

  const logs = db.prepare(sql).all(...params);
  res.json(logs);
});

module.exports = router;
