const { query, queryOne } = require('../config/database');
const {
  CAMPAIGN_STATUSES,
  CAMPAIGN_TRANSITIONS,
  assertTransition,
  isCampaignTerminal,
} = require('../domain/states');

async function logCampaignEvent(campaignId, fromStatus, toStatus, source, metadata = {}) {
  await query(
    `INSERT INTO campaign_status_events (campaign_id, from_status, to_status, source, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [campaignId, fromStatus, toStatus, source, JSON.stringify(metadata)]
  );
}

async function getCampaign(campaignId) {
  return queryOne('SELECT * FROM campaigns WHERE id = $1', [campaignId]);
}

async function transitionCampaign(campaignId, toStatus, {
  source = 'system',
  stats = null,
  metadata = {},
} = {}) {
  const campaign = await getCampaign(campaignId);
  if (!campaign) {
    const error = new Error('Campaign not found');
    error.status = 404;
    throw error;
  }

  const fromStatus = campaign.status;
  if (fromStatus === toStatus) return campaign;

  if (isCampaignTerminal(fromStatus)) {
    const error = new Error(`Campaign is in terminal state: ${fromStatus}`);
    error.status = 409;
    throw error;
  }

  assertTransition(CAMPAIGN_TRANSITIONS, fromStatus, toStatus, 'campaign');

  const updates = ['status = $1', 'updated_at = NOW()'];
  const values = [toStatus];
  let idx = 2;

  if (toStatus === CAMPAIGN_STATUSES.SENDING) {
    updates.push('started_at = COALESCE(started_at, NOW())');
  }
  if ([CAMPAIGN_STATUSES.COMPLETED, CAMPAIGN_STATUSES.CANCELLED, CAMPAIGN_STATUSES.FAILED].includes(toStatus)) {
    updates.push('completed_at = NOW()');
  }
  if (stats) {
    updates.push(`stats_json = $${idx}::jsonb`);
    values.push(JSON.stringify(stats));
    idx += 1;
  }

  values.push(campaignId);
  const updated = await queryOne(
    `UPDATE campaigns SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );

  await logCampaignEvent(campaignId, fromStatus, toStatus, source, metadata);
  return updated;
}

function initialCampaignStatus(scheduledAt) {
  return scheduledAt ? CAMPAIGN_STATUSES.SCHEDULED : CAMPAIGN_STATUSES.DRAFT;
}

module.exports = {
  CAMPAIGN_STATUSES,
  getCampaign,
  transitionCampaign,
  initialCampaignStatus,
  logCampaignEvent,
};
