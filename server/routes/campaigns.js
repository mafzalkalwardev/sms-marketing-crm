const express = require('express');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { countSegments, estimateCost } = require('../lib/sms');

const router = express.Router();
router.use(authenticate);

function campaignForUser(id, workspaceId) {
  return db.prepare('SELECT * FROM campaigns WHERE id = ? AND workspace_id = ?').get(id, workspaceId);
}

function eligibleContacts(workspaceId) {
  return db.prepare(
    `SELECT * FROM contacts
     WHERE workspace_id = ?
       AND is_unsubscribed = 0
       AND consent_status = 'opted_in'
       AND phone NOT IN (SELECT phone FROM suppression_list WHERE workspace_id = ?)`
  ).all(workspaceId, workspaceId);
}

router.get('/', (req, res) => {
  const campaigns = db.prepare('SELECT * FROM campaigns WHERE workspace_id = ? ORDER BY datetime(created_at) DESC, id DESC').all(req.user.workspace_id || 1);
  res.json(campaigns);
});

router.post('/', (req, res) => {
  const { title, message_template, send_rate, scheduled_at } = req.body;
  if (!title || !message_template) return res.status(400).json({ error: 'Campaign title and message are required' });
  const result = db.prepare(
    'INSERT INTO campaigns (workspace_id, title, message_template, send_rate, scheduled_at, created_by, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(req.user.workspace_id || 1, title, message_template, send_rate || 1, scheduled_at || null, req.user.id, 'draft');
  res.json({ id: result.lastInsertRowid });
});

router.get('/:id', (req, res) => {
  const campaign = campaignForUser(req.params.id, req.user.workspace_id || 1);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  res.json(campaign);
});

router.post('/:id/preview', (req, res) => {
  const workspaceId = req.user.workspace_id || 1;
  const campaign = campaignForUser(req.params.id, workspaceId);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  const contacts = eligibleContacts(workspaceId);
  const sample = contacts.slice(0, 5).map((contact) => ({
    contactId: contact.id,
    phone: contact.phone,
    message: campaign.message_template.replaceAll('{{name}}', contact.name || ''),
  }));
  const segments = countSegments(campaign.message_template);
  res.json({
    recipients: contacts.length,
    excluded: db.prepare('SELECT COUNT(*) as n FROM contacts WHERE workspace_id = ? AND (is_unsubscribed = 1 OR consent_status != ?)').get(workspaceId, 'opted_in').n,
    segments,
    estimatedCost: Number((contacts.length * estimateCost(segments)).toFixed(4)),
    sample,
  });
});

router.post('/:id/send', (req, res) => {
  const workspaceId = req.user.workspace_id || 1;
  const campaign = campaignForUser(req.params.id, workspaceId);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  const contacts = eligibleContacts(workspaceId);
  const insert = db.prepare(
    `INSERT INTO messages (
      workspace_id, campaign_id, contact_id, direction, to_number, message_body,
      provider, provider_message_id, status, segments, cost_estimate, sent_at
    ) VALUES (?, ?, ?, 'outbound', ?, ?, 'mock', ?, 'queued_mock', ?, ?, datetime('now'))`
  );
  const segments = countSegments(campaign.message_template);
  const tx = db.transaction(() => {
    contacts.forEach((contact) => {
      const body = campaign.message_template.replaceAll('{{name}}', contact.name || '');
      insert.run(workspaceId, campaign.id, contact.id, contact.phone, body, `campaign_mock_${campaign.id}_${contact.id}`, segments, estimateCost(segments, contact.country));
    });
    db.prepare("UPDATE campaigns SET status = 'queued', updated_at = datetime('now') WHERE id = ?").run(campaign.id);
  });
  tx();
  res.json({ ok: true, status: 'queued', queued: contacts.length, mode: 'mock' });
});

router.post('/:id/pause', (req, res) => {
  const campaign = campaignForUser(req.params.id, req.user.workspace_id || 1);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  db.prepare("UPDATE campaigns SET status = 'paused', updated_at = datetime('now') WHERE id = ?").run(campaign.id);
  res.json({ ok: true, status: 'paused' });
});

router.post('/:id/cancel', (req, res) => {
  const campaign = campaignForUser(req.params.id, req.user.workspace_id || 1);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  db.prepare("UPDATE campaigns SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(campaign.id);
  res.json({ ok: true, status: 'cancelled' });
});

module.exports = router;
