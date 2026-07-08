const express = require('express');
const bcrypt = require('bcryptjs');
const { query, queryOne, queryAll } = require('../../config/database');
const { bindOrgFilter } = require('../../lib/orgScope');
const { authenticate, requireAdmin } = require('../../middleware/auth');
const { assertUserInOrg, getOrgBranding, resolveTenancy } = require('../../services/tenancyService');
const { createApiKey, listApiKeys, revokeApiKey } = require('../../services/apiKeyService');
const { revokeAllSessions } = require('../../services/sessionService');

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
    const scoped = bindOrgFilter(sql, req, '', idx);
    sql = scoped.sql;
    params.push(...scoped.params);
    idx = scoped.nextIdx;
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
    await assertUserInOrg(req.user, req.params.id);

    await query('UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2', [status, req.params.id]);
    if (status === 'suspended' || status === 'inactive') {
      await revokeAllSessions(req.params.id);
    }
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
    await assertUserInOrg(req.user, req.params.id);

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

    if (plan_name) {
      await query(
        `INSERT INTO subscriptions (user_id, plan_name, status, starts_at)
         VALUES ($1, $2, 'active', NOW())
         ON CONFLICT (user_id) DO UPDATE SET plan_name = EXCLUDED.plan_name, status = 'active', updated_at = NOW()`,
        [req.params.id, plan_name]
      );
    }

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
    } else if (req.user.role !== 'super_admin') {
      sql += ` AND u.organization_id = $${idx} AND (u.managed_by_admin_id = $${idx + 1} OR u.id = $${idx + 1})`;
      params.push(req.user.organization_id || 1, req.user.id);
      idx += 2;
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
    if (req.user.role !== 'super_admin') {
      sql += ` AND (a.organization_id = $${idx} OR t.organization_id = $${idx} OR al.actor_user_id = $${idx + 1})`;
      params.push(req.user.organization_id || 1, req.user.id);
      idx += 2;
    }
    sql += ` ORDER BY al.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(Number(limit), (Number(page) - 1) * Number(limit));

    const logs = await queryAll(sql, params);
    res.json(logs);
  } catch (e) {
    next(e);
  }
});

router.get('/audit-logs/export', async (req, res, next) => {
  try {
    const { from, to, action } = req.query;
    let sql = `SELECT al.id, al.created_at, al.action, al.details,
                      a.name AS actor_name, a.email AS actor_email,
                      t.name AS target_name, t.email AS target_email
               FROM audit_logs al
               LEFT JOIN users a ON a.id = al.actor_user_id
               LEFT JOIN users t ON t.id = al.target_user_id
               WHERE 1=1`;
    const params = [];
    let idx = 1;

    if (action) {
      sql += ` AND al.action = $${idx}`;
      params.push(action);
      idx += 1;
    }
    if (from) {
      sql += ` AND al.created_at >= $${idx}`;
      params.push(from);
      idx += 1;
    }
    if (to) {
      sql += ` AND al.created_at <= $${idx}`;
      params.push(to);
      idx += 1;
    }
    if (req.user.role !== 'super_admin') {
      sql += ` AND (a.organization_id = $${idx} OR t.organization_id = $${idx} OR al.actor_user_id = $${idx + 1})`;
      params.push(req.user.organization_id || 1, req.user.id);
      idx += 2;
    }
    sql += ' ORDER BY al.created_at DESC LIMIT 5000';

    const logs = await queryAll(sql, params);
    const header = 'id,timestamp,action,actor_name,actor_email,target_name,target_email,details\n';
    const body = logs.map((row) => {
      const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      return [
        row.id,
        escape(row.created_at),
        escape(row.action),
        escape(row.actor_name),
        escape(row.actor_email),
        escape(row.target_name),
        escape(row.target_email),
        escape(typeof row.details === 'string' ? row.details : JSON.stringify(row.details || {})),
      ].join(',');
    }).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="signalmint-audit-export.csv"');
    res.send(header + body);
  } catch (e) {
    next(e);
  }
});

router.get('/branding', async (req, res, next) => {
  try {
    res.json(await getOrgBranding(req.user.organization_id));
  } catch (e) {
    next(e);
  }
});

router.put('/branding', async (req, res, next) => {
  try {
    const {
      brand_name: brandNameSnake,
      brandName,
      logo_url: logoUrlSnake,
      logoUrl,
      primary_color: primaryColorSnake,
      primaryColor,
      support_email: supportEmailSnake,
      supportEmail,
      message_retention_days: retentionSnake,
      messageRetentionDays,
      hipaa_mode: hipaaSnake,
      hipaaMode,
    } = req.body;
    const orgId = req.user.organization_id || 1;
    const updated = await queryOne(
      `UPDATE organizations
       SET brand_name = COALESCE($1, brand_name),
           logo_url = COALESCE($2, logo_url),
           primary_color = COALESCE($3, primary_color),
           support_email = COALESCE($4, support_email),
           message_retention_days = COALESCE($5, message_retention_days),
           hipaa_mode = COALESCE($6, hipaa_mode),
           updated_at = NOW()
       WHERE id = $7
       RETURNING id`,
      [
        brandNameSnake ?? brandName,
        logoUrlSnake ?? logoUrl,
        primaryColorSnake ?? primaryColor,
        supportEmailSnake ?? supportEmail,
        retentionSnake ?? messageRetentionDays,
        hipaaSnake ?? hipaaMode,
        orgId,
      ]
    );
    await query(
      'INSERT INTO audit_logs (actor_user_id, action, details) VALUES ($1, $2, $3::jsonb)',
      [req.user.id, 'org_branding_updated', JSON.stringify({ organizationId: orgId })]
    );
    res.json(await getOrgBranding(updated.id));
  } catch (e) {
    next(e);
  }
});

router.get('/api-keys', async (req, res, next) => {
  try {
    res.json(await listApiKeys(req.user));
  } catch (e) {
    next(e);
  }
});

router.post('/api-keys', async (req, res, next) => {
  try {
    const created = await createApiKey({
      user: req.user,
      name: req.body.name,
      scopes: req.body.scopes,
    });
    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
});

router.delete('/api-keys/:id', async (req, res, next) => {
  try {
    res.json(await revokeApiKey({ user: req.user, keyId: req.params.id }));
  } catch (e) {
    next(e);
  }
});

router.get('/pending-approvals', async (req, res, next) => {
  try {
    let sql = `SELECT id, name, email, phone, role, status, organization_id, managed_by_admin_id, created_at
      FROM users WHERE status = 'pending_approval'`;
    const params = [];
    if (req.user.role !== 'super_admin') {
      sql += ` AND (organization_id = $1 OR managed_by_admin_id = $2)`;
      params.push(req.user.organization_id || 1, req.user.id);
    }
    sql += ' ORDER BY created_at ASC';
    const users = await queryAll(sql, params);
    res.json(users);
  } catch (e) {
    next(e);
  }
});

router.post('/users', async (req, res, next) => {
  try {
    const {
      name,
      email,
      password,
      phone,
      message_limit_monthly: messageLimit,
      number_limit: numberLimit,
      subscription_plan: planName,
    } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    const hash = await bcrypt.hash(password, 10);
    const { organizationId, workspaceId } = await resolveTenancy(req.user);

    const user = await queryOne(
      `INSERT INTO users (name, email, password_hash, phone, role, status, organization_id, workspace_id,
       managed_by_admin_id, message_limit_monthly, number_limit, subscription_plan, email_verified_at, phone_verified_at)
       VALUES ($1, $2, $3, $4, 'user', 'active', $5, $6, $7, $8, $9, $10, NOW(), NOW()) RETURNING *`,
      [
        name,
        email.toLowerCase(),
        hash,
        phone || null,
        organizationId,
        workspaceId,
        req.user.id,
        messageLimit || 1000,
        numberLimit || 2,
        planName || 'starter',
      ]
    );
    await query(
      "INSERT INTO subscriptions (user_id, plan_name, status, starts_at) VALUES ($1, $2, 'active', NOW())",
      [user.id, planName || 'starter']
    );
    await query(
      'INSERT INTO audit_logs (actor_user_id, target_user_id, action, details) VALUES ($1, $2, $3, $4::jsonb)',
      [req.user.id, user.id, 'user_created', JSON.stringify({ email: user.email })]
    );
    res.status(201).json({ ok: true, user });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    next(e);
  }
});

router.put('/users/:id', async (req, res, next) => {
  try {
    const user = await queryOne('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    await assertUserInOrg(req.user, req.params.id);
    if (user.role !== 'user') return res.status(403).json({ error: 'Can only edit managed users' });

    const { name, email, phone, message_limit_monthly: messageLimit, number_limit: numberLimit } = req.body;
    await query(
      `UPDATE users SET name = COALESCE($1, name), email = COALESCE($2, email), phone = COALESCE($3, phone),
       message_limit_monthly = COALESCE($4, message_limit_monthly), number_limit = COALESCE($5, number_limit),
       updated_at = NOW() WHERE id = $6`,
      [name, email?.toLowerCase(), phone, messageLimit, numberLimit, user.id]
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.delete('/users/:id', async (req, res, next) => {
  try {
    const user = await queryOne('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    await assertUserInOrg(req.user, req.params.id);
    if (user.role !== 'user') return res.status(403).json({ error: 'Can only delete managed users' });

    await query("UPDATE users SET status = 'inactive', updated_at = NOW() WHERE id = $1", [user.id]);
    await revokeAllSessions(user.id);
    await query(
      'INSERT INTO audit_logs (actor_user_id, target_user_id, action, details) VALUES ($1, $2, $3, $4::jsonb)',
      [req.user.id, user.id, 'user_deleted', JSON.stringify({ userName: user.name })]
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/users/:id/approve', async (req, res, next) => {
  try {
    const user = await queryOne('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.status !== 'pending_approval') {
      return res.status(400).json({ error: 'User is not pending approval' });
    }
    if (req.user.role !== 'super_admin') {
      if (user.organization_id && user.organization_id !== req.user.organization_id) {
        return res.status(403).json({ error: 'User is outside your organization' });
      }
      if (user.managed_by_admin_id && user.managed_by_admin_id !== req.user.id) {
        return res.status(403).json({ error: 'User is not assigned to you' });
      }
    }

    const { organizationId, workspaceId } = await resolveTenancy(req.user);
    await query(
      `UPDATE users SET status = 'active', organization_id = COALESCE(organization_id, $1),
       workspace_id = COALESCE(workspace_id, $2), managed_by_admin_id = COALESCE(managed_by_admin_id, $3),
       updated_at = NOW() WHERE id = $4`,
      [organizationId, workspaceId, req.user.id, user.id]
    );
    await query("UPDATE subscriptions SET status = 'active' WHERE user_id = $1", [user.id]);
    await query(
      'INSERT INTO audit_logs (actor_user_id, target_user_id, action, details) VALUES ($1, $2, $3, $4::jsonb)',
      [req.user.id, user.id, 'user_approved', JSON.stringify({})]
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/invite-codes', async (req, res, next) => {
  try {
    const crypto = require('crypto');
    const code = req.body.code || `INV-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const { max_uses: maxUses, expires_at: expiresAt } = req.body;
    const row = await queryOne(
      `INSERT INTO org_invite_codes (code, organization_id, admin_user_id, max_uses, expires_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [code, req.user.organization_id, req.user.id, maxUses || null, expiresAt || null]
    );
    res.status(201).json(row);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Invite code already exists' });
    next(e);
  }
});

module.exports = router;
