process.env.CAMPAIGN_QUEUE_DRIVER = 'memory';
require('dotenv').config();
delete require.cache[require.resolve('../services/queue/campaignDriver/index')];
delete require.cache[require.resolve('../services/campaignQueue')];

const { initDatabase, query } = require('../config/database');
const { CAMPAIGN_STATUSES } = require('../services/campaignStateService');
const { getCampaignProgress } = require('../services/campaignService');
const campaignQueue = require('../services/campaignQueue');

async function run() {
  await initDatabase();

  const stamp = Date.now();
  const suffix = String(stamp).slice(-7);

  const user = await query(
    `INSERT INTO users (name, email, password_hash, role, status, message_limit_monthly, organization_id)
     VALUES ('Fanout Test', $1, 'unused', 'user', 'active', 5000, 1)
     RETURNING *`,
    [`campaign-fanout-${stamp}@example.com`]
  ).then((r) => r.rows[0]);

  const contacts = [];
  for (let i = 0; i < 5; i += 1) {
    const row = await query(
      `INSERT INTO contacts (user_id, workspace_id, organization_id, name, phone, country, consent_status, is_unsubscribed)
       VALUES ($1, 1, 1, $2, $3, 'US', 'opted_in', FALSE)
       RETURNING id`,
      [user.id, `Contact ${i}`, `+1555${String(stamp + i).slice(-7)}`]
    );
    contacts.push(row.rows[0].id);
  }

  await query(
    `INSERT INTO numbers (user_id, phone_number, country, type, label, provider, status, is_default)
     VALUES ($1, $2, 'US', 'long-code', 'Main', 'mock', 'active', TRUE)`,
    [user.id, `+1666${suffix}`]
  );

  const campaign = await query(
    `INSERT INTO campaigns (workspace_id, user_id, title, message_template, send_rate, created_by, status, from_number)
     VALUES (1, $1, $2, 'Hello {{name}}', 20, $1, 'draft', $3)
     RETURNING *`,
    [user.id, `Fanout test ${stamp}`, `+1666${suffix}`]
  ).then((r) => r.rows[0]);

  const queued = await campaignQueue.enqueueCampaign({
    campaignId: campaign.id,
    userId: user.id,
    workspaceId: 1,
    fromNumber: `+1666${suffix}`,
  });

  if (queued.status !== CAMPAIGN_STATUSES.QUEUED) {
    throw new Error(`Expected queued, got ${JSON.stringify(queued)}`);
  }

  await campaignQueue.flush();

  const finished = await query('SELECT status FROM campaigns WHERE id = $1', [campaign.id]).then((r) => r.rows[0]);
  if (finished.status !== CAMPAIGN_STATUSES.COMPLETED) {
    throw new Error(`Expected completed, got ${finished.status}`);
  }

  const progress = await getCampaignProgress(campaign.id);
  if (progress.sent !== 5) {
    throw new Error(`Expected 5 sent, got ${JSON.stringify(progress)}`);
  }

  console.log(`Campaign fan-out test passed (campaign #${campaign.id}, driver=${queued.driver || 'memory'})`);
}

run().catch((error) => {
  console.error('FAILED:', error.message);
  process.exit(1);
});
