const express = require('express');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { vonageConfigured } = require('../lib/sms');

const router = express.Router();
router.use(authenticate);

router.get('/dashboard', (req, res) => {
  const ws = req.user.workspace_id || 1;
  const scalar = (sql, ...params) => db.prepare(sql).get(...params).n;
  const totalContacts = scalar('SELECT COUNT(*) as n FROM contacts WHERE workspace_id = ?', ws);
  const optedIn = scalar("SELECT COUNT(*) as n FROM contacts WHERE workspace_id = ? AND consent_status = 'opted_in' AND is_unsubscribed = 0", ws);
  const unsubscribed = scalar('SELECT COUNT(*) as n FROM contacts WHERE workspace_id = ? AND is_unsubscribed = 1', ws);
  const sentToday = scalar("SELECT COUNT(*) as n FROM messages WHERE workspace_id = ? AND direction = 'outbound' AND date(sent_at) = date('now')", ws);
  const repliesToday = scalar("SELECT COUNT(*) as n FROM messages WHERE workspace_id = ? AND direction = 'inbound' AND date(created_at) = date('now')", ws);
  const failed = scalar("SELECT COUNT(*) as n FROM messages WHERE workspace_id = ? AND status IN ('failed', 'rejected', 'expired')", ws);
  const activeCampaigns = scalar("SELECT COUNT(*) as n FROM campaigns WHERE workspace_id = ? AND status IN ('queued', 'sending', 'draft')", ws);
  const outbound = scalar("SELECT COUNT(*) as n FROM messages WHERE workspace_id = ? AND direction = 'outbound'", ws);
  const delivered = scalar("SELECT COUNT(*) as n FROM messages WHERE workspace_id = ? AND status IN ('delivered', 'sent', 'sent_mock', 'accepted')", ws);
  const inbound = scalar("SELECT COUNT(*) as n FROM messages WHERE workspace_id = ? AND direction = 'inbound'", ws);
  const totalCost = db.prepare('SELECT COALESCE(SUM(cost_estimate), 0) as n FROM messages WHERE workspace_id = ?').get(ws).n;
  const recentMessages = db.prepare(
    `SELECT messages.*, contacts.name
     FROM messages LEFT JOIN contacts ON contacts.id = messages.contact_id
     WHERE messages.workspace_id = ?
     ORDER BY datetime(messages.created_at) DESC, messages.id DESC LIMIT 8`
  ).all(ws);
  const recentCampaigns = db.prepare('SELECT * FROM campaigns WHERE workspace_id = ? ORDER BY datetime(created_at) DESC, id DESC LIMIT 5').all(ws);

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
});

module.exports = router;
