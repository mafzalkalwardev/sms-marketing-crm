const { queryOne } = require('../../../config/database');
const { sendCampaign } = require('../../campaignService');
const { CAMPAIGN_STATUSES, transitionCampaign } = require('../../campaignStateService');

const queue = [];
const pendingIds = new Set();
let draining = false;

function isPending(campaignId) {
  return pendingIds.has(Number(campaignId));
}

function getQueueSnapshot() {
  return {
    driver: 'memory',
    pending: queue.length,
    campaignIds: queue.map((job) => job.campaignId),
    draining,
  };
}

function kick() {
  if (draining) return;
  drain().catch((error) => {
    console.error('Campaign queue drain error:', error.message);
  });
}

async function drain() {
  if (draining) return;
  draining = true;

  while (queue.length > 0) {
    const job = queue.shift();
    pendingIds.delete(job.campaignId);

    try {
      await runJob(job);
    } catch (error) {
      console.error(`Campaign job #${job.campaignId} failed:`, error.message);
      try {
        const campaign = await queryOne('SELECT status FROM campaigns WHERE id = $1', [job.campaignId]);
        if (campaign && ![CAMPAIGN_STATUSES.COMPLETED, CAMPAIGN_STATUSES.CANCELLED].includes(campaign.status)) {
          await transitionCampaign(job.campaignId, CAMPAIGN_STATUSES.FAILED, {
            source: 'queue_error',
            metadata: { error: error.message },
          });
        }
      } catch (transitionError) {
        console.error(`Campaign #${job.campaignId} failure transition error:`, transitionError.message);
      }
    }
  }

  draining = false;
}

async function runJob({ campaignId, userId, fromNumber, workspaceId }) {
  const user = await queryOne('SELECT * FROM users WHERE id = $1', [userId]);
  if (!user) {
    const error = new Error('Campaign user not found');
    error.status = 404;
    throw error;
  }

  const campaign = await queryOne('SELECT * FROM campaigns WHERE id = $1', [campaignId]);
  if (!campaign) {
    const error = new Error('Campaign not found');
    error.status = 404;
    throw error;
  }

  if ([CAMPAIGN_STATUSES.COMPLETED, CAMPAIGN_STATUSES.CANCELLED, CAMPAIGN_STATUSES.FAILED].includes(campaign.status)) {
    return { ok: true, skipped: true, status: campaign.status };
  }

  return sendCampaign({
    campaign,
    user,
    fromNumber: fromNumber || campaign.from_number,
    workspaceId: workspaceId || campaign.workspace_id,
  });
}

async function enqueueCampaign({ campaignId, userId, fromNumber, workspaceId }) {
  const id = Number(campaignId);
  if (pendingIds.has(id)) {
    return { ok: true, status: CAMPAIGN_STATUSES.QUEUED, mode: 'async', driver: 'memory', alreadyQueued: true };
  }

  pendingIds.add(id);
  queue.push({ campaignId: id, userId, fromNumber, workspaceId });
  kick();

  return {
    ok: true,
    status: CAMPAIGN_STATUSES.QUEUED,
    mode: 'async',
    driver: 'memory',
    position: queue.length,
  };
}

async function enqueueRecipients({ campaignId, userId, fromNumber, workspaceId }) {
  return enqueueCampaign({ campaignId, userId, fromNumber, workspaceId, resume: true });
}

async function recoverStuckCampaigns() {
  if (process.env.CAMPAIGN_QUEUE_RECOVER === 'false') return;

  const { queryAll } = require('../../../config/database');
  const rows = await queryAll(
    `SELECT id, user_id, from_number, workspace_id
     FROM campaigns
     WHERE status IN ($1, $2)`,
    [CAMPAIGN_STATUSES.QUEUED, CAMPAIGN_STATUSES.SENDING]
  );

  for (const row of rows) {
    await enqueueCampaign({
      campaignId: row.id,
      userId: row.user_id,
      fromNumber: row.from_number,
      workspaceId: row.workspace_id,
    });
  }

  if (rows.length > 0) {
    console.log(`Campaign queue recovered ${rows.length} in-flight campaign(s)`);
  }
}

function startCampaignQueue() {
  if (process.env.CAMPAIGN_QUEUE_ENABLED === 'false') return;
  recoverStuckCampaigns().catch((error) => {
    console.error('Campaign queue recovery failed:', error.message);
  });
  console.log('Campaign broadcast queue started (in-process memory driver)');
}

async function flush() {
  kick();
  while (queue.length > 0 || draining) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function shutdown() {}

module.exports = {
  enqueueCampaign,
  enqueueRecipients,
  isPending,
  getQueueSnapshot,
  startCampaignQueue,
  drain,
  flush,
  shutdown,
};
