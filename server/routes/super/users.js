const express = require('express');
const bcrypt = require('bcryptjs');
const { query, queryOne, queryAll, withTransaction } = require('../../config/database');
const { createSession, revokeAllSessions } = require('../../services/sessionService');
const { workspaceForOrganization } = require('../../services/tenancyService');

const router = express.Router();

function parseOptionalInt(value) {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : undefined;
}

function publicUserRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    status: row.status,
    organization_id: row.organization_id,
    workspace_id: row.workspace_id,
    managed_by_admin_id: row.managed_by_admin_id,
    subscription_plan: row.subscription_plan,
    message_limit_monthly: row.message_limit_monthly,
    number_limit: row.number_limit,
    subscription_expires_at: row.subscription_expires_at,
    email_verified_at: row.email_verified_at,
    phone_verified_at: row.phone_verified_at,
    created_at: row.created_at,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const { search = '', role = '', status = '', page = '1', limit = '50' } = req.query;
    let sql = `SELECT id, name, email, phone, role, status, organization_id, workspace_id, subscription_plan,
      message_limit_monthly, number_limit, subscription_expires_at, managed_by_admin_id, created_at
      FROM users WHERE role != $1`;
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

router.get('/pending-approvals', async (req, res, next) => {
  try {
    const users = await queryAll(
      `SELECT id, name, email, phone, role, status, organization_id, managed_by_admin_id, created_at
       FROM users WHERE status = 'pending_approval' ORDER BY created_at ASC`
    );
    res.json(users);
  } catch (e) {
    next(e);
  }
});

router.post('/impersonate/end', async (req, res, next) => {
  try {
    const active = await queryOne(
      `SELECT * FROM impersonation_sessions
       WHERE super_admin_id = $1 AND ended_at IS NULL
       ORDER BY started_at DESC LIMIT 1`,
      [req.user.id]
    );
    if (active) {
      await query('UPDATE impersonation_sessions SET ended_at = NOW() WHERE id = $1', [active.id]);
    }
    const superAdmin = await queryOne('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const meta = {
      ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress,
      userAgent: req.headers['user-agent'],
    };
    const { token } = await createSession(superAdmin, meta);
    res.json({ token, user: publicUserRow(superAdmin) });
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const user = await queryOne('SELECT * FROM users WHERE id = $1 AND role != $2', [req.params.id, 'super_admin']);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const managedCount = await queryOne(
      'SELECT COUNT(*)::int AS n FROM users WHERE managed_by_admin_id = $1',
      [user.id]
    );
    res.json({ user: publicUserRow(user), managedUsersCount: managedCount?.n || 0 });
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const {
      name,
      email,
      password,
      phone,
      role = 'user',
      organization_id: organizationId,
      managed_by_admin_id: managedByAdminId,
      org_name: orgName,
      message_limit_monthly: messageLimit,
      number_limit: numberLimit,
      subscription_plan: planName,
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    if (!['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: 'Role must be admin or user' });
    }

    const hash = await bcrypt.hash(password, 10);
    let createdUser;

    if (role === 'admin') {
      const orgLabel = orgName || `${name}'s Organization`;
      createdUser = await withTransaction(async (tx) => {
        const org = await tx.queryOne(
          `INSERT INTO organizations (name, brand_name, status, delivery_mode)
           VALUES ($1, $1, 'active', 'sandbox') RETURNING id`,
          [orgLabel]
        );
        const ws = await tx.queryOne(
          `INSERT INTO workspaces (company_name, organization_id, status, country)
           VALUES ($1, $2, 'active', 'US') RETURNING id`,
          [`${orgLabel} Workspace`, org.id]
        );
        const admin = await tx.queryOne(
          `INSERT INTO users (name, email, password_hash, phone, role, status, organization_id, workspace_id,
           message_limit_monthly, number_limit, subscription_plan, email_verified_at, phone_verified_at)
           VALUES ($1, $2, $3, $4, 'admin', 'active', $5, $6, $7, $8, $9, NOW(), NOW()) RETURNING *`,
          [
            name,
            email.toLowerCase(),
            hash,
            phone || null,
            org.id,
            ws.id,
            parseOptionalInt(messageLimit) ?? 5000,
            parseOptionalInt(numberLimit) ?? 10,
            planName || 'pro',
          ]
        );
        await tx.query('UPDATE organizations SET admin_user_id = $1 WHERE id = $2', [admin.id, org.id]);
        await tx.query(
          "INSERT INTO subscriptions (user_id, plan_name, status, starts_at) VALUES ($1, $2, 'active', NOW())",
          [admin.id, planName || 'pro']
        );
        return admin;
      });
    } else {
      let orgId = organizationId;
      let workspaceId = organizationId ? await workspaceForOrganization(organizationId) : null;
      let managedBy = managedByAdminId || null;

      if (!orgId && managedBy) {
        const admin = await queryOne('SELECT organization_id, workspace_id FROM users WHERE id = $1 AND role = $2', [
          managedBy,
          'admin',
        ]);
        if (!admin) return res.status(400).json({ error: 'Managed-by admin not found' });
        orgId = admin.organization_id;
        workspaceId = admin.workspace_id;
      }
      if (!orgId) return res.status(400).json({ error: 'organization_id or managed_by_admin_id required for users' });

      createdUser = await queryOne(
        `INSERT INTO users (name, email, password_hash, phone, role, status, organization_id, workspace_id,
         managed_by_admin_id, message_limit_monthly, number_limit, subscription_plan, email_verified_at, phone_verified_at)
         VALUES ($1, $2, $3, $4, 'user', 'active', $5, $6, $7, $8, $9, $10, NOW(), NOW()) RETURNING *`,
        [
          name,
          email.toLowerCase(),
          hash,
          phone || null,
          orgId,
          workspaceId,
          managedBy,
          parseOptionalInt(messageLimit) ?? 1000,
          parseOptionalInt(numberLimit) ?? 2,
          planName || 'starter',
        ]
      );
      await query(
        "INSERT INTO subscriptions (user_id, plan_name, status, starts_at) VALUES ($1, $2, 'active', NOW())",
        [createdUser.id, planName || 'starter']
      );
    }

    await query(
      'INSERT INTO audit_logs (actor_user_id, target_user_id, action, details) VALUES ($1, $2, $3, $4::jsonb)',
      [req.user.id, createdUser.id, 'user_created', JSON.stringify({ role, email: createdUser.email })]
    );

    res.status(201).json({ ok: true, user: publicUserRow(createdUser) });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    next(e);
  }
});

router.put('/:id/limits', async (req, res, next) => {
  try {
    const user = await queryOne('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'super_admin') return res.status(403).json({ error: 'Cannot modify super admin accounts' });

    const {
      plan_name: planName,
      subscription_plan: subscriptionPlan,
      message_limit_monthly: messageLimit,
      number_limit: numberLimit,
      subscription_expires_at: expiresAt,
      expires_at: expiresAtAlt,
    } = req.body;

    const resolvedPlan = planName || subscriptionPlan;
    const resolvedMsgLimit = parseOptionalInt(messageLimit);
    const resolvedNumLimit = parseOptionalInt(numberLimit);
    const resolvedExpires = expiresAt || expiresAtAlt || null;

    const updates = [];
    const values = [];
    let idx = 1;

    if (resolvedPlan) {
      updates.push(`subscription_plan = $${idx}`);
      values.push(resolvedPlan);
      idx += 1;
    }
    if (resolvedMsgLimit !== undefined) {
      updates.push(`message_limit_monthly = $${idx}`);
      values.push(resolvedMsgLimit);
      idx += 1;
    }
    if (resolvedNumLimit !== undefined) {
      updates.push(`number_limit = $${idx}`);
      values.push(resolvedNumLimit);
      idx += 1;
    }
    if (expiresAt !== undefined || expiresAtAlt !== undefined) {
      updates.push(`subscription_expires_at = $${idx}`);
      values.push(resolvedExpires);
      idx += 1;
    }

    if (!updates.length) return res.status(400).json({ error: 'No limit fields to update' });

    values.push(req.params.id);
    await query(`UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx}`, values);

    if (resolvedPlan) {
      await query(
        `INSERT INTO subscriptions (user_id, plan_name, status, starts_at)
         VALUES ($1, $2, 'active', NOW())
         ON CONFLICT (user_id) DO UPDATE SET plan_name = EXCLUDED.plan_name, status = 'active', updated_at = NOW()`,
        [user.id, resolvedPlan]
      );
    }

    await query(
      'INSERT INTO audit_logs (actor_user_id, target_user_id, action, details) VALUES ($1, $2, $3, $4::jsonb)',
      [req.user.id, user.id, 'limits_updated', JSON.stringify(req.body)]
    );

    res.json({ ok: true, user: publicUserRow(await queryOne('SELECT * FROM users WHERE id = $1', [user.id])) });
  } catch (e) {
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const user = await queryOne('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'super_admin') return res.status(403).json({ error: 'Cannot modify super admin accounts' });

    const {
      name,
      email,
      role,
      status,
      organization_id: organizationId,
      managed_by_admin_id: managedByAdminId,
      message_limit_monthly: messageLimit,
      number_limit: numberLimit,
      subscription_plan: planName,
    } = req.body;

    const updates = [];
    const values = [];
    let idx = 1;
    const add = (col, val) => {
      updates.push(`${col} = $${idx}`);
      values.push(val);
      idx += 1;
    };

    if (name) add('name', name);
    if (email) add('email', email.toLowerCase());
    if (role && ['admin', 'user'].includes(role)) add('role', role);
    if (status) add('status', status);
    if (organizationId) add('organization_id', organizationId);
    if (managedByAdminId !== undefined) add('managed_by_admin_id', managedByAdminId);
    const resolvedMsgLimit = parseOptionalInt(messageLimit);
    const resolvedNumLimit = parseOptionalInt(numberLimit);
    if (resolvedMsgLimit !== undefined) add('message_limit_monthly', resolvedMsgLimit);
    if (resolvedNumLimit !== undefined) add('number_limit', resolvedNumLimit);
    if (planName) add('subscription_plan', planName);

    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    values.push(req.params.id);
    await query(`UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx}`, values);

    if (status === 'suspended' || status === 'inactive') {
      await revokeAllSessions(user.id);
    }

    await query(
      'INSERT INTO audit_logs (actor_user_id, target_user_id, action, details) VALUES ($1, $2, $3, $4::jsonb)',
      [req.user.id, user.id, 'user_updated', JSON.stringify(req.body)]
    );

    res.json({ ok: true, user: publicUserRow(await queryOne('SELECT * FROM users WHERE id = $1', [user.id])) });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const user = await queryOne('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'super_admin') return res.status(403).json({ error: 'Cannot delete super admin accounts' });
    if (user.id === req.user.id) return res.status(403).json({ error: 'Cannot delete your own account' });

    await query("UPDATE users SET status = 'inactive', updated_at = NOW() WHERE id = $1", [user.id]);
    await revokeAllSessions(user.id);
    await query(
      'INSERT INTO audit_logs (actor_user_id, target_user_id, action, details) VALUES ($1, $2, $3, $4::jsonb)',
      [req.user.id, user.id, 'user_deleted', JSON.stringify({ userName: user.name, userEmail: user.email })]
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/approve', async (req, res, next) => {
  try {
    const user = await queryOne('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.status !== 'pending_approval') {
      return res.status(400).json({ error: 'User is not pending approval' });
    }

    const { organization_id: organizationId, managed_by_admin_id: managedByAdminId } = req.body;
    let orgId = organizationId || user.organization_id;
    let workspaceId = user.workspace_id;
    let managedBy = managedByAdminId || user.managed_by_admin_id;

    if (!orgId && managedBy) {
      const admin = await queryOne('SELECT organization_id, workspace_id FROM users WHERE id = $1', [managedBy]);
      orgId = admin?.organization_id;
      workspaceId = admin?.workspace_id;
    }
    if (!orgId) {
      return res.status(400).json({ error: 'Assign organization_id or managed_by_admin_id before approval' });
    }
    if (!workspaceId) workspaceId = await workspaceForOrganization(orgId);

    await query(
      `UPDATE users SET status = 'active', organization_id = $1, workspace_id = $2,
       managed_by_admin_id = COALESCE($3, managed_by_admin_id), updated_at = NOW() WHERE id = $4`,
      [orgId, workspaceId, managedBy, user.id]
    );
    await query(
      "UPDATE subscriptions SET status = 'active', updated_at = NOW() WHERE user_id = $1",
      [user.id]
    );
    await query(
      'INSERT INTO audit_logs (actor_user_id, target_user_id, action, details) VALUES ($1, $2, $3, $4::jsonb)',
      [req.user.id, user.id, 'user_approved', JSON.stringify({ organizationId: orgId, managedByAdminId: managedBy })]
    );
    res.json({ ok: true, user: publicUserRow(await queryOne('SELECT * FROM users WHERE id = $1', [user.id])) });
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

    if (status === 'suspended' || status === 'inactive') {
      await revokeAllSessions(user.id);
    }

    res.json({
      ok: true,
      user: { id: user.id, name: user.name, email: user.email, status },
      cascadedCount,
    });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/impersonate', async (req, res, next) => {
  try {
    const target = await queryOne('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.role === 'super_admin') return res.status(403).json({ error: 'Cannot impersonate super admin' });
    if (target.status !== 'active') return res.status(400).json({ error: 'Can only impersonate active users' });

    const meta = {
      ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress,
      userAgent: req.headers['user-agent'],
      impersonatedBy: req.user.id,
    };
    const { token, sessionId } = await createSession(target, meta);

    await query(
      `INSERT INTO impersonation_sessions (super_admin_id, target_user_id, auth_session_id)
       VALUES ($1, $2, $3)`,
      [req.user.id, target.id, sessionId]
    );
    await query(
      'INSERT INTO audit_logs (actor_user_id, target_user_id, action, details) VALUES ($1, $2, $3, $4::jsonb)',
      [req.user.id, target.id, 'impersonation_started', JSON.stringify({ targetEmail: target.email })]
    );

    res.json({
      token,
      user: publicUserRow(target),
      impersonated_by: req.user.id,
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
