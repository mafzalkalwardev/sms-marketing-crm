const express = require('express');
const { queryOne, queryAll } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { vonageConfigured } = require('../lib/sms');

const router = express.Router();
router.use(authenticate);

router.get('/dashboard', async (req, res, next) => {
  try {
    const ws = req.user.workspace_id || 1;
    const scalar = async (sql, params) => {
      const row = await queryOne(sql, params);
      return Number(row?.n || 0);
    };

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
      "SELECT COUNT(*)::int AS n FROM messages WHERE workspace_id = $1 AND status IN ('failed', 'rejected', 'expired')",
      [ws]
    );
    const activeCampaigns = await scalar(
      "SELECT COUNT(*)::int AS n FROM campaigns WHERE workspace_id = $1 AND status IN ('queued', 'sending', 'draft')",
      [ws]
    );
    const outbound = await scalar(
      "SELECT COUNT(*)::int AS n FROM messages WHERE workspace_id = $1 AND direction = 'outbound'",
      [ws]
    );
    const delivered = await scalar(
      "SELECT COUNT(*)::int AS n FROM messages WHERE workspace_id = $1 AND status IN ('delivered', 'sent', 'sent_mock', 'accepted')",
      [ws]
    );
    const inbound = await scalar(
      "SELECT COUNT(*)::int AS n FROM messages WHERE workspace_id = $1 AND direction = 'inbound'",
      [ws]
    );
    const costRow = await queryOne(
      'SELECT COALESCE(SUM(cost_estimate), 0)::float AS n FROM messages WHERE workspace_id = $1',
      [ws]
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
      providerMode: vonageConfigured() ? 'vonage' : 'mock',
      recentMessages,
      recentCampaigns,
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
