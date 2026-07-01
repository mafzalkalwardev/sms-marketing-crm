if (!process.env.REDIS_URL) {
  console.log('SKIP: REDIS_URL not set — BullMQ fan-out test skipped');
  process.exit(0);
}

process.env.CAMPAIGN_QUEUE_DRIVER = 'bullmq';
require('dotenv').config({ quiet: true });

const { initDatabase, query } = require('../config/database');
const { CAMPAIGN_STATUSES } = require('../services/campaignStateService');
const { getCampaignProgress } = require('../services/campaignService');

delete require.cache[require.resolve('../services/queue/campaignDriver/index')];
delete require.cache[require.resolve('../services/campaignQueue')];
const campaignQueue = require('../services/campaignQueue');

async function run() {
  await initDatabase();

  const stamp = Date.now();
  const suffix = String(stamp).slice(-7);

  const user = await query(
    `INSERT INTO users (name, email, password_hash, role, status, message_limit_monthly, organization_id)
     VALUES ('Bull Test', $1, 'unused', 'user', 'active', 5000, 1)
     RETURNING *`,
    [`campaign-bull-${stamp}@example.com`]
  ).then((r) => r.rows[0]);

  for (let i = 0; i < 3; i += 1) {
    await query(
      `INSERT INTO contacts (user_id, workspace_id, organization_id, name, phone, country, consent_status, is_unsubscribed)
       VALUES ($1, 1, 1, $2, $3, 'US', 'opted_in', FALSE)`,
      [user.id, `Bull ${i}`, `+1555${String(stamp + i).slice(-7)}`]
    );
  }

  await query(
    `INSERT INTO numbers (user_id, phone_number, country, type, label, provider, status, is_default)
     VALUES ($1, $2, 'US', 'long-code', 'Main', 'mock', 'active', TRUE)`,
    [user.id, `+1666${suffix}`]
  );

  const campaign = await query(
    `INSERT INTO campaigns (workspace_id, user_id, title, message_template, send_rate, created_by, status, from_number)
     VALUES (1, $1, $2, 'Hi {{name}}', 10, $1, 'draft', $3)
     RETURNING *`,
    [user.id, `Bull ${stamp}`, `+1666${suffix}`]
  ).then((r) => r.rows[0]);

  campaignQueue.startCampaignQueue();

  const queued = await campaignQueue.enqueueCampaign({
    campaignId: campaign.id,
    userId: user.id,
    workspaceId: 1,
    fromNumber: `+1666${suffix}`,
  });

  if (queued.driver !== 'bullmq') {
    throw new Error(`Expected bullmq driver, got ${JSON.stringify(queued)}`);
  }

  await campaignQueue.flush();

  const finished = await query('SELECT status FROM campaigns WHERE id = $1', [campaign.id]).then((r) => r.rows[0]);
  if (finished.status !== CAMPAIGN_STATUSES.COMPLETED) {
    throw new Error(`Expected completed, got ${finished.status}`);
  }

  const progress = await getCampaignProgress(campaign.id);
  if (progress.sent !== 3) {
    throw new Error(`Expected 3 sent, got ${JSON.stringify(progress)}`);
  }

  await campaignQueue.shutdown();
  console.log(`Campaign BullMQ test passed (campaign #${campaign.id})`);
}

run().catch((error) => {
  console.error('FAILED:', error.message);
  process.exit(1);
});
