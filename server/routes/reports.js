const express = require('express');
const { queryOne, queryAll } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { getProviderStatus } = require('../services/smsService');

const router = express.Router();
router.use(authenticate);

function workspaceId(req) {
  return req.user.workspace_id || 1;
}

router.get('/dashboard', async (req, res, next) => {
  try {
    const ws = workspaceId(req);
    const { from, to } = req.query;
    const scalar = async (sql, params) => {
      const row = await queryOne(sql, params);
      return Number(row?.n || 0);
    };

    let dateFilter = '';
    const dateParams = [];
    let idx = 2;
    if (from) {
      dateFilter += ` AND created_at >= $${idx}`;
      dateParams.push(from);
      idx += 1;
    }
    if (to) {
      dateFilter += ` AND created_at <= $${idx}`;
      dateParams.push(to);
      idx += 1;
    }

    const totalContacts = await scalar('SELECT COUNT(*)::int AS n FROM contacts WHERE workspace_id = $1', [ws]);
    const optedIn = await scalar(
      "SELECT COUNT(*)::int AS n FROM contacts WHERE workspace_id = $1 AND consent_status = 'opted_in' AND is_unsubscribed = FALSE",
      [ws]
    );
    const unsubscribed = await scalar(
      'SELECT COUNT(*)::int AS n FROM contacts WHERE workspace_id = $1 AND is_unsubscribed = TRUE',
      [ws]
    );
    const sentToday = await scalar(
      "SELECT COUNT(*)::int AS n FROM messages WHERE workspace_id = $1 AND direction = 'outbound' AND sent_at::date = CURRENT_DATE",
      [ws]
    );
    const repliesToday = await scalar(
      "SELECT COUNT(*)::int AS n FROM messages WHERE workspace_id = $1 AND direction = 'inbound' AND created_at::date = CURRENT_DATE",
      [ws]
    );
    const failed = await scalar(
      `SELECT COUNT(*)::int AS n FROM messages WHERE workspace_id = $1 AND status IN ('failed', 'rejected', 'expired')${dateFilter}`,
      [ws, ...dateParams]
    );
    const activeCampaigns = await scalar(
      "SELECT COUNT(*)::int AS n FROM campaigns WHERE workspace_id = $1 AND status IN ('queued', 'sending', 'draft')",
      [ws]
    );
    const outbound = await scalar(
      `SELECT COUNT(*)::int AS n FROM messages WHERE workspace_id = $1 AND direction = 'outbound'${dateFilter}`,
      [ws, ...dateParams]
    );
    const delivered = await scalar(
      `SELECT COUNT(*)::int AS n FROM messages WHERE workspace_id = $1 AND status IN ('delivered', 'sent', 'sent_mock', 'accepted')${dateFilter}`,
      [ws, ...dateParams]
    );
    const inbound = await scalar(
      `SELECT COUNT(*)::int AS n FROM messages WHERE workspace_id = $1 AND direction = 'inbound'${dateFilter}`,
      [ws, ...dateParams]
    );
    const costRow = await queryOne(
      `SELECT COALESCE(SUM(cost_estimate), 0)::float AS n FROM messages WHERE workspace_id = $1${dateFilter}`,
      [ws, ...dateParams]
    );
    const totalCost = Number(costRow?.n || 0);
    const recentMessages = await queryAll(
      `SELECT messages.*, contacts.name
       FROM messages LEFT JOIN contacts ON contacts.id = messages.contact_id
       WHERE messages.workspace_id = $1
       ORDER BY messages.created_at DESC, messages.id DESC LIMIT 8`,
      [ws]
    );
    const recentCampaigns = await queryAll(
      'SELECT * FROM campaigns WHERE workspace_id = $1 ORDER BY created_at DESC, id DESC LIMIT 5',
      [ws]
    );

    const platform = getProviderStatus();

    res.json({
      totalContacts,
      optedIn,
      unsubscribed,
      sentToday,
      repliesToday,
      failed,
      activeCampaigns,
      campaigns: activeCampaigns,
      deliveryRate: outbound ? Math.round((delivered / outbound) * 100) : 0,
      replyRate: outbound ? Math.round((inbound / outbound) * 100) : 0,
      totalCost: Number(totalCost.toFixed(4)),
      providerMode: platform.deliveryMode || 'sandbox',
      outbound,
      inbound,
      delivered,
      recentMessages,
      recentCampaigns,
    });
  } catch (e) {
    next(e);
  }
});

router.get('/messages', async (req, res, next) => {
  try {
    const ws = workspaceId(req);
    const { from, to, direction = 'all', status = 'all', limit = '50' } = req.query;
    let sql = `
      SELECT m.id, m.direction, m.status, m.to_number, m.from_number, m.message_body,
             m.cost_estimate, m.created_at, c.name AS contact_name
      FROM messages m
      LEFT JOIN contacts c ON c.id = m.contact_id
      WHERE m.workspace_id = $1
    `;
    const params = [ws];
    let idx = 2;

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
    if (direction !== 'all') {
      sql += ` AND m.direction = $${idx}`;
      params.push(direction);
      idx += 1;
    }
    if (status !== 'all') {
      sql += ` AND m.status = $${idx}`;
      params.push(status);
      idx += 1;
    }
    sql += ` ORDER BY m.created_at DESC LIMIT $${idx}`;
    params.push(Math.min(Number(limit) || 50, 200));

    const rows = await queryAll(sql, params);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
