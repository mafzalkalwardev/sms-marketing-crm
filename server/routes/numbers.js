const express = require('express');
const { query, queryOne, queryAll } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { normalizePhone, isValidPhone } = require('../lib/sms');
const { dataUserIdClause } = require('../lib/orgScope');
const { assertUserInOrg } = require('../services/tenancyService');
const { resolveTenancy } = require('../services/tenancyService');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    let sql = `SELECT id, user_id, workspace_id, phone_number, country, type, label, status, is_default, created_at, updated_at
       FROM numbers WHERE 1=1`;
    const params = [];
    let idx = 1;

    if (req.user.role === 'admin' || req.user.role === 'super_admin') {
      const { user_id } = req.query;
      if (user_id && req.user.role === 'admin') {
        await assertUserInOrg(req.user, user_id);
        sql += ` AND user_id = $${idx}`;
        params.push(user_id);
        idx += 1;
      } else if (user_id && req.user.role === 'super_admin') {
        sql += ` AND user_id = $${idx}`;
        params.push(user_id);
        idx += 1;
      } else {
        const scope = dataUserIdClause(req.user, 'user_id', idx);
        sql += scope.clause;
        params.push(...scope.params);
        idx = scope.nextIdx;
      }
    } else {
      sql += ` AND user_id = $${idx}`;
      params.push(req.user.id);
      idx += 1;
    }

    sql += ' ORDER BY is_default DESC, id DESC';
    const numbers = await queryAll(sql, params);
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

    const { organizationId, workspaceId } = await resolveTenancy(req.user);
    const result = await query(
      `INSERT INTO numbers (user_id, workspace_id, organization_id, phone_number, country, type, label, provider, status, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'mock', 'active', $8) RETURNING id`,
      [req.user.id, workspaceId, organizationId, phone, country || 'US', type || 'long-code', label || '', Boolean(is_default)]
    );
    res.json({ id: result.rows[0].id });
  } catch (e) {
    next(e);
  }
});

async function assertNumberAccess(actor, number) {
  if (!number) {
    const error = new Error('Number not found');
    error.status = 404;
    throw error;
  }
  if (actor.role === 'user' && number.user_id !== actor.id) {
    const error = new Error('Forbidden');
    error.status = 403;
    throw error;
  }
  if (actor.role === 'admin') {
    await assertUserInOrg(actor, number.user_id);
  }
}

router.put('/:id', async (req, res, next) => {
  try {
    const { label, status, is_default, phone_number } = req.body;
    const number = await queryOne('SELECT * FROM numbers WHERE id = $1', [req.params.id]);
    await assertNumberAccess(req.user, number);

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
    await assertNumberAccess(req.user, number);
    await query('DELETE FROM numbers WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/set-default', async (req, res, next) => {
  try {
    const number = await queryOne('SELECT * FROM numbers WHERE id = $1', [req.params.id]);
    await assertNumberAccess(req.user, number);
    if (number.user_id !== req.user.id && req.user.role === 'user') {
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
