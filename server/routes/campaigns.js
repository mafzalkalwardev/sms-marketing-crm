const express = require('express');
const { query, queryOne, queryAll } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { CAMPAIGN_STATUSES, transitionCampaign, initialCampaignStatus } = require('../services/campaignStateService');
const {
  campaignForUser,
  previewCampaign,
  getCampaignStats,
} = require('../services/campaignService');
const campaignQueue = require('../services/campaignQueue');

const router = express.Router();
router.use(authenticate);

function workspaceContext(req) {
  return {
    workspaceId: req.user.workspace_id || 1,
    isAdmin: req.user.role === 'admin' || req.user.role === 'super_admin',
  };
}

router.get('/queue/status', async (req, res, next) => {
  try {
    res.json(await campaignQueue.getQueueSnapshot());
  } catch (e) {
    next(e);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { workspaceId, isAdmin } = workspaceContext(req);
    const sql = isAdmin
      ? 'SELECT * FROM campaigns WHERE workspace_id = $1 ORDER BY created_at DESC, id DESC'
      : 'SELECT * FROM campaigns WHERE workspace_id = $1 AND (user_id = $2 OR created_by = $2) ORDER BY created_at DESC, id DESC';
    const campaigns = isAdmin
      ? await queryAll(sql, [workspaceId])
      : await queryAll(sql, [workspaceId, req.user.id]);
    res.json(campaigns);
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { workspaceId } = workspaceContext(req);
    const { title, message_template, send_rate, scheduled_at, from_number } = req.body;
    if (!title || !message_template) return res.status(400).json({ error: 'Campaign title and message are required' });
    const status = initialCampaignStatus(scheduled_at);
    const result = await query(
      `INSERT INTO campaigns (
        workspace_id, user_id, title, message_template, send_rate, scheduled_at, from_number, created_by, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        workspaceId,
        req.user.id,
        title,
        message_template,
        send_rate || 1,
        scheduled_at || null,
        from_number || null,
        req.user.id,
        status,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { workspaceId, isAdmin } = workspaceContext(req);
    const campaign = await campaignForUser(req.params.id, req.user.id, workspaceId, isAdmin);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    const stats = await getCampaignStats(campaign.id);
    res.json({ ...campaign, ...stats });
  } catch (e) {
    next(e);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { workspaceId, isAdmin } = workspaceContext(req);
    const campaign = await campaignForUser(req.params.id, req.user.id, workspaceId, isAdmin);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (![CAMPAIGN_STATUSES.DRAFT, CAMPAIGN_STATUSES.SCHEDULED, CAMPAIGN_STATUSES.PAUSED].includes(campaign.status)) {
      return res.status(409).json({ error: 'Campaign cannot be edited in its current state' });
    }

    const { title, message_template, send_rate, scheduled_at, from_number } = req.body;
    const updated = await queryOne(
      `UPDATE campaigns
       SET title = COALESCE($1, title),
           message_template = COALESCE($2, message_template),
           send_rate = COALESCE($3, send_rate),
           scheduled_at = COALESCE($4, scheduled_at),
           from_number = COALESCE($5, from_number),
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [title, message_template, send_rate, scheduled_at, from_number, campaign.id]
    );
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/preview', async (req, res, next) => {
  try {
    const { workspaceId, isAdmin } = workspaceContext(req);
    const campaign = await campaignForUser(req.params.id, req.user.id, workspaceId, isAdmin);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json(await previewCampaign(campaign, req.user.id, workspaceId, isAdmin));
  } catch (e) {
    next(e);
  }
});

router.post('/:id/send', async (req, res, next) => {
  try {
    const { workspaceId, isAdmin } = workspaceContext(req);
    const campaign = await campaignForUser(req.params.id, req.user.id, workspaceId, isAdmin);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (![CAMPAIGN_STATUSES.DRAFT, CAMPAIGN_STATUSES.SCHEDULED, CAMPAIGN_STATUSES.QUEUED].includes(campaign.status)) {
      return res.status(409).json({ error: `Cannot send campaign in state: ${campaign.status}` });
    }
    if (campaign.status === CAMPAIGN_STATUSES.DRAFT || campaign.status === CAMPAIGN_STATUSES.SCHEDULED) {
      await transitionCampaign(campaign.id, CAMPAIGN_STATUSES.QUEUED, { source: 'api_enqueue' });
    }
    const result = await campaignQueue.enqueueCampaign({
      campaignId: campaign.id,
      userId: req.user.id,
      fromNumber: req.body.from || campaign.from_number,
      workspaceId,
    });
    res.status(202).json(result);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/resume', async (req, res, next) => {
  try {
    const { workspaceId, isAdmin } = workspaceContext(req);
    const campaign = await campaignForUser(req.params.id, req.user.id, workspaceId, isAdmin);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    const result = await require('../services/campaignService').resumeCampaign({
      campaign,
      user: req.user,
      fromNumber: req.body.from || campaign.from_number,
      workspaceId,
    });
    res.status(202).json(result);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/pause', async (req, res, next) => {
  try {
    const { workspaceId, isAdmin } = workspaceContext(req);
    const campaign = await campaignForUser(req.params.id, req.user.id, workspaceId, isAdmin);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    const updated = await transitionCampaign(campaign.id, CAMPAIGN_STATUSES.PAUSED, { source: 'api_pause' });
    res.json({ ok: true, status: updated.status });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/retry-failed', async (req, res, next) => {
  try {
    const { workspaceId, isAdmin } = workspaceContext(req);
    const campaign = await campaignForUser(req.params.id, req.user.id, workspaceId, isAdmin);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    const { retryFailedRecipients } = require('../services/campaignService');
    const result = await retryFailedRecipients({
      campaignId: campaign.id,
      userId: req.user.id,
      workspaceId,
      fromNumber: req.body.from || campaign.from_number,
    });
    res.status(202).json(result);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/cancel', async (req, res, next) => {
  try {
    const { workspaceId, isAdmin } = workspaceContext(req);
    const campaign = await campaignForUser(req.params.id, req.user.id, workspaceId, isAdmin);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    const updated = await transitionCampaign(campaign.id, CAMPAIGN_STATUSES.CANCELLED, { source: 'api_cancel' });
    res.json({ ok: true, status: updated.status });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
