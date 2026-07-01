const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');
const { query, queryOne } = require('../../../config/database');
const {
  prepareCampaignSend,
  sendCampaignRecipient,
  eligibleContacts,
  maybeFinalizeCampaign,
} = require('../../campaignService');
const { CAMPAIGN_STATUSES } = require('../../campaignStateService');

const QUEUE_NAME = 'signalmint-campaign-recipients';
const pendingIds = new Set();
let queue = null;
let worker = null;
let connection = null;

function redisConnection() {
  if (!connection) {
    connection = new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
    });
  }
  return connection;
}

function getQueue() {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection: redisConnection() });
  }
  return queue;
}

async function recordDeadLetter({ campaignId, contactId, jobId, errorMessage, attempts }) {
  await query(
    `INSERT INTO campaign_job_dead_letters (campaign_id, contact_id, job_id, error_message, attempts)
     VALUES ($1, $2, $3, $4, $5)`,
    [campaignId, contactId, jobId || null, errorMessage || 'unknown', attempts || 0]
  );
}

async function processRecipientJob(job) {
  const { campaignId, contactId, userId, fromNumber, workspaceId } = job.data;
  try {
    return await sendCampaignRecipient({
      campaignId,
      contactId,
      userId,
      fromNumber,
      workspaceId,
    });
  } catch (error) {
    const attempts = job.attemptsMade + 1;
    const maxAttempts = job.opts.attempts || 3;
    if (attempts >= maxAttempts) {
      await recordDeadLetter({
        campaignId,
        contactId,
        jobId: job.id,
        errorMessage: error.message,
        attempts,
      });
    }
    throw error;
  }
}

function startWorker() {
  if (worker || process.env.CAMPAIGN_WORKER_ENABLED === 'false') return worker;

  const concurrency = Math.max(1, Number(process.env.CAMPAIGN_WORKER_CONCURRENCY) || 5);
  worker = new Worker(QUEUE_NAME, processRecipientJob, {
    connection: redisConnection(),
    concurrency,
  });

  worker.on('failed', (job, error) => {
    console.error(`Campaign recipient job ${job?.id} failed:`, error.message);
  });

  console.log(`Campaign BullMQ worker started (concurrency=${concurrency})`);
  return worker;
}

async function buildRecipientJobs({ campaignId, userId, workspaceId, fromNumber, contactIds, sendRate }) {
  const rate = Math.max(1, Number(sendRate) || 1);
  const staggerMs = Math.floor(1000 / rate);

  return contactIds.map((contactId, index) => ({
    name: `campaign-${campaignId}-contact-${contactId}`,
    data: {
      campaignId: Number(campaignId),
      contactId: Number(contactId),
      userId: Number(userId),
      fromNumber,
      workspaceId: Number(workspaceId),
    },
    opts: {
      jobId: `c${campaignId}-u${contactId}`,
      delay: index * staggerMs,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 1000,
      removeOnFail: 500,
    },
  }));
}

async function resolveContactIds({ campaignId, userId, workspaceId, contactIds, resume }) {
  if (contactIds?.length) return contactIds;

  const user = await queryOne('SELECT * FROM users WHERE id = $1', [userId]);
  const isAdmin = user.role === 'admin' || user.role === 'super_admin';

  if (resume) {
    const pending = await query(
      `SELECT contact_id FROM campaign_recipients
       WHERE campaign_id = $1 AND status IN ('pending', 'queued', 'sending', 'failed')`,
      [campaignId]
    );
    if (pending.rows.length > 0) {
      return pending.rows.map((row) => row.contact_id);
    }
  }

  const contacts = await eligibleContacts(userId, workspaceId, isAdmin);
  return contacts.map((contact) => contact.id);
}

async function enqueueRecipients({
  campaignId,
  userId,
  fromNumber,
  workspaceId,
  contactIds,
  resume = false,
}) {
  const user = await queryOne('SELECT * FROM users WHERE id = $1', [userId]);
  if (!user) {
    const error = new Error('Campaign user not found');
    error.status = 404;
    throw error;
  }

  const ids = await resolveContactIds({ campaignId, userId, workspaceId, contactIds, resume });
  const { campaign, fromNumber: resolvedFrom } = await prepareCampaignSend({
    campaignId,
    user,
    workspaceId,
    fromNumber,
  });

  if (ids.length === 0) {
    await maybeFinalizeCampaign(campaignId);
    return { ok: true, status: CAMPAIGN_STATUSES.COMPLETED, mode: 'async', driver: 'bullmq', jobs: 0 };
  }

  const jobs = await buildRecipientJobs({
    campaignId,
    userId,
    workspaceId,
    fromNumber: resolvedFrom,
    contactIds: ids,
    sendRate: campaign.send_rate,
  });

  await getQueue().addBulk(jobs);

  return {
    ok: true,
    status: CAMPAIGN_STATUSES.QUEUED,
    mode: 'async',
    driver: 'bullmq',
    jobs: jobs.length,
  };
}

async function enqueueCampaign({ campaignId, userId, fromNumber, workspaceId, resume = false }) {
  const id = Number(campaignId);
  if (pendingIds.has(id) && !resume) {
    return { ok: true, status: CAMPAIGN_STATUSES.QUEUED, mode: 'async', driver: 'bullmq', alreadyQueued: true };
  }

  pendingIds.add(id);
  try {
    return await enqueueRecipients({
      campaignId: id,
      userId,
      fromNumber,
      workspaceId,
      resume,
    });
  } finally {
    pendingIds.delete(id);
  }
}

async function getQueueSnapshot() {
  const counts = await getQueue().getJobCounts(
    'waiting',
    'active',
    'completed',
    'failed',
    'delayed'
  );
  return {
    driver: 'bullmq',
    ...counts,
    pending: (counts.waiting || 0) + (counts.active || 0) + (counts.delayed || 0),
    campaignIds: [],
  };
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
      resume: true,
    });
  }

  if (rows.length > 0) {
    console.log(`Campaign BullMQ recovered ${rows.length} in-flight campaign(s)`);
  }
}

function startCampaignQueue() {
  if (process.env.CAMPAIGN_QUEUE_ENABLED === 'false') return;
  startWorker();
  recoverStuckCampaigns().catch((error) => {
    console.error('Campaign queue recovery failed:', error.message);
  });
  console.log('Campaign broadcast queue started (BullMQ / Redis)');
}

async function flush() {
  while (true) {
    const counts = await getQueue().getJobCounts('waiting', 'active', 'delayed');
    const pending = (counts.waiting || 0) + (counts.active || 0) + (counts.delayed || 0);
    if (pending === 0) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function shutdown() {
  if (worker) await worker.close();
  if (queue) await queue.close();
  if (connection) await connection.quit();
}

module.exports = {
  enqueueCampaign,
  enqueueRecipients,
  isPending: (campaignId) => pendingIds.has(Number(campaignId)),
  getQueueSnapshot,
  startCampaignQueue,
  startWorker,
  flush,
  shutdown,
};
