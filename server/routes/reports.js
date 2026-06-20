const express = require('express');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/dashboard', (req, res) => {
  const ws = req.user.workspace_id || 1;
  const totalContacts = db.prepare('SELECT COUNT(*) as n FROM contacts WHERE workspace_id = ?').get(ws).n;
  const optedIn = db.prepare('SELECT COUNT(*) as n FROM contacts WHERE workspace_id = ? AND consent_status = "opted_in"').get(ws).n;
  const unsubscribed = db.prepare('SELECT COUNT(*) as n FROM contacts WHERE workspace_id = ? AND is_unsubscribed = 1').get(ws).n;
  const sentToday = db.prepare('SELECT COUNT(*) as n FROM messages WHERE workspace_id = ? AND direction = "outbound" AND date(sent_at) = date("now")').get(ws).n;
  const repliesToday = db.prepare('SELECT COUNT(*) as n FROM messages WHERE workspace_id = ? AND direction = "inbound" AND date(created_at) = date("now")').get(ws).n;
  const failed = db.prepare('SELECT COUNT(*) as n FROM messages WHERE workspace_id = ? AND status = "failed"').get(ws).n;
  const campaigns = db.prepare('SELECT COUNT(*) as n FROM campaigns WHERE workspace_id = ?').get(ws).n;
  res.json({ totalContacts, optedIn, unsubscribed, sentToday, repliesToday, failed, campaigns });
});

module.exports = router;