const express = require('express');
const { query, queryOne, queryAll, withTransaction } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { countSegments, estimateCost } = require('../lib/sms');

const router = express.Router();
router.use(authenticate);

async function campaignForUser(id, workspaceId) {
  return queryOne('SELECT * FROM campaigns WHERE id = $1 AND workspace_id = $2', [id, workspaceId]);
}

async function eligibleContacts(workspaceId) {
  return queryAll(
    `SELECT * FROM contacts
     WHERE workspace_id = $1
       AND is_unsubscribed = FALSE
       AND consent_status = 'opted_in'
       AND phone NOT IN (SELECT phone FROM suppression_list WHERE workspace_id = $1)`,
    [workspaceId]
  );
}

router.get('/', async (req, res, next) => {
  try {
    const campaigns = await queryAll(
      'SELECT * FROM campaigns WHERE workspace_id = $1 ORDER BY created_at DESC, id DESC',
      [req.user.workspace_id || 1]
    );
    res.json(campaigns);
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { title, message_template, send_rate, scheduled_at } = req.body;
    if (!title || !message_template) return res.status(400).json({ error: 'Campaign title and message are required' });
    const result = await query(
      `INSERT INTO campaigns (workspace_id, title, message_template, send_rate, scheduled_at, created_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'draft') RETURNING id`,
      [req.user.workspace_id || 1, title, message_template, send_rate || 1, scheduled_at || null, req.user.id]
    );
    res.json({ id: result.rows[0].id });
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const campaign = await campaignForUser(req.params.id, req.user.workspace_id || 1);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json(campaign);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/preview', async (req, res, next) => {
  try {
    const workspaceId = req.user.workspace_id || 1;
    const campaign = await campaignForUser(req.params.id, workspaceId);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    const contacts = await eligibleContacts(workspaceId);
    const sample = contacts.slice(0, 5).map((contact) => ({
      contactId: contact.id,
      phone: contact.phone,
      message: campaign.message_template.replaceAll('{{name}}', contact.name || ''),
    }));
    const segments = countSegments(campaign.message_template);
    const excludedRow = await queryOne(
      'SELECT COUNT(*)::int AS n FROM contacts WHERE workspace_id = $1 AND (is_unsubscribed = TRUE OR consent_status != $2)',
      [workspaceId, 'opted_in']
    );
    res.json({
      recipients: contacts.length,
      excluded: excludedRow?.n || 0,
      segments,
      estimatedCost: Number((contacts.length * estimateCost(segments)).toFixed(4)),
      sample,
    });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/send', async (req, res, next) => {
  try {
    const workspaceId = req.user.workspace_id || 1;
    const campaign = await campaignForUser(req.params.id, workspaceId);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    const contacts = await eligibleContacts(workspaceId);
    const segments = countSegments(campaign.message_template);

    await withTransaction(async (tx) => {
      for (const contact of contacts) {
        const body = campaign.message_template.replaceAll('{{name}}', contact.name || '');
        await tx.query(
          `INSERT INTO messages (
            workspace_id, campaign_id, contact_id, direction, to_number, message_body,
            provider, provider_message_id, status, segments, cost_estimate, sent_at
          ) VALUES ($1, $2, $3, 'outbound', $4, $5, 'mock', $6, 'queued_mock', $7, $8, NOW())`,
          [
            workspaceId,
            campaign.id,
            contact.id,
            contact.phone,
            body,
            `campaign_mock_${campaign.id}_${contact.id}`,
            segments,
            estimateCost(segments, contact.country),
          ]
        );
      }
      await tx.query("UPDATE campaigns SET status = 'queued', updated_at = NOW() WHERE id = $1", [campaign.id]);
    });

    res.json({ ok: true, status: 'queued', queued: contacts.length, mode: 'mock' });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/pause', async (req, res, next) => {
  try {
    const campaign = await campaignForUser(req.params.id, req.user.workspace_id || 1);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    await query("UPDATE campaigns SET status = 'paused', updated_at = NOW() WHERE id = $1", [campaign.id]);
    res.json({ ok: true, status: 'paused' });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/cancel', async (req, res, next) => {
  try {
    const campaign = await campaignForUser(req.params.id, req.user.workspace_id || 1);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    await query("UPDATE campaigns SET status = 'cancelled', updated_at = NOW() WHERE id = $1", [campaign.id]);
    res.json({ ok: true, status: 'cancelled' });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
