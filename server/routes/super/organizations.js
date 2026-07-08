const express = require('express');
const { query, queryOne, queryAll } = require('../../config/database');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const orgs = await queryAll(
      `SELECT o.*,
        (SELECT COUNT(*)::int FROM users u WHERE u.organization_id = o.id AND u.role = 'user') AS user_count,
        (SELECT name FROM users WHERE id = o.admin_user_id) AS admin_name
       FROM organizations o
       ORDER BY o.id ASC`
    );
    res.json({ organizations: orgs });
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, brand_name: brandName, delivery_mode: deliveryMode } = req.body;
    if (!name) return res.status(400).json({ error: 'Organization name is required' });

    const org = await queryOne(
      `INSERT INTO organizations (name, brand_name, status, delivery_mode)
       VALUES ($1, $2, 'active', $3) RETURNING *`,
      [name, brandName || name, deliveryMode || 'sandbox']
    );
    const ws = await queryOne(
      `INSERT INTO workspaces (company_name, organization_id, status, country)
       VALUES ($1, $2, 'active', 'US') RETURNING id`,
      [`${name} Workspace`, org.id]
    );
    res.status(201).json({ organization: org, workspace_id: ws.id });
  } catch (e) {
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const {
      name,
      brand_name: brandName,
      status,
      delivery_mode: deliveryMode,
      support_email: supportEmail,
    } = req.body;
    const org = await queryOne('SELECT * FROM organizations WHERE id = $1', [req.params.id]);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const updated = await queryOne(
      `UPDATE organizations
       SET name = COALESCE($1, name),
           brand_name = COALESCE($2, brand_name),
           status = COALESCE($3, status),
           delivery_mode = COALESCE($4, delivery_mode),
           support_email = COALESCE($5, support_email),
           approved_for_live_at = CASE WHEN $4 = 'live' AND delivery_mode != 'live' THEN NOW() ELSE approved_for_live_at END,
           approved_for_live_by = CASE WHEN $4 = 'live' AND delivery_mode != 'live' THEN $6 ELSE approved_for_live_by END,
           updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [name, brandName, status, deliveryMode, supportEmail, req.user.id, req.params.id]
    );

    await query(
      'INSERT INTO audit_logs (actor_user_id, action, details) VALUES ($1, $2, $3::jsonb)',
      [req.user.id, 'organization_updated', JSON.stringify({ organizationId: org.id, delivery_mode: deliveryMode })]
    );

    res.json({ organization: updated });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
