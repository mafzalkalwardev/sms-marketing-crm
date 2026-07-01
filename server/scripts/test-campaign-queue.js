process.env.CAMPAIGN_QUEUE_DRIVER = 'memory';
require('dotenv').config();
delete require.cache[require.resolve('../services/queue/campaignDriver/index')];
delete require.cache[require.resolve('../services/campaignQueue')];

const { initDatabase, query } = require('../config/database');
const { CAMPAIGN_STATUSES } = require('../services/campaignStateService');
const { getCampaignStats } = require('../services/campaignService');
const campaignQueue = require('../services/campaignQueue');

async function run() {
  await initDatabase();

  const stamp = Date.now();
  const suffix = String(stamp).slice(-7);

  const user = await query(
    `INSERT INTO users (name, email, password_hash, role, status, message_limit_monthly, organization_id)
     VALUES ('Queue Test', $1, 'unused', 'user', 'active', 5000, 1)
     RETURNING *`,
    [`campaign-queue-${stamp}@example.com`]
  ).then((r) => r.rows[0]);

  if (!user) throw new Error('Failed to create test user');

  await query(
    `INSERT INTO contacts (user_id, workspace_id, organization_id, name, phone, country, consent_status, is_unsubscribed)
     VALUES ($1, 1, 1, 'Queue Contact', $2, 'US', 'opted_in', FALSE)`,
    [user.id, `+1555${suffix}`]
  );

  await query(
    `INSERT INTO numbers (user_id, phone_number, country, type, label, provider, status, is_default)
     VALUES ($1, $2, 'US', 'long-code', 'Main', 'mock', 'active', TRUE)`,
    [user.id, `+1666${suffix}`]
  );

  const campaign = await query(
    `INSERT INTO campaigns (workspace_id, user_id, title, message_template, send_rate, created_by, status, from_number)
     VALUES (1, $1, $2, 'Hello {{name}}', 10, $1, 'draft', $3)
     RETURNING *`,
    [user.id, `Queue test ${stamp}`, `+1666${suffix}`]
  ).then((r) => r.rows[0]);

  const queued = await campaignQueue.enqueueCampaign({
    campaignId: campaign.id,
    userId: user.id,
    workspaceId: 1,
    fromNumber: `+1666${suffix}`,
  });

  if (queued.status !== CAMPAIGN_STATUSES.QUEUED || queued.mode !== 'async') {
    throw new Error(`Expected async queued response, got ${JSON.stringify(queued)}`);
  }

  await campaignQueue.flush();

  const finished = await query('SELECT status, stats_json FROM campaigns WHERE id = $1', [campaign.id]).then((r) => r.rows[0]);
  if (finished.status !== CAMPAIGN_STATUSES.COMPLETED) {
    const recipients = await query('SELECT status, error_message FROM campaign_recipients WHERE campaign_id = $1', [campaign.id]);
    throw new Error(`Expected completed campaign, got ${finished.status} stats=${JSON.stringify(finished.stats_json)} recipients=${JSON.stringify(recipients.rows)}`);
  }

  const stats = await getCampaignStats(campaign.id);
  const snapshot = await campaignQueue.getQueueSnapshot();
  if (snapshot.pending !== 0) {
    throw new Error(`Queue should be empty, pending=${snapshot.pending}`);
  }

  console.log(`Campaign queue test passed (campaign #${campaign.id}, recipients=${JSON.stringify(stats.recipients)})`);
}

run().catch((error) => {
  console.error('FAILED:', error.message);
  process.exit(1);
});
