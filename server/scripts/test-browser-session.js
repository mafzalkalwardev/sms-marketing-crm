require('dotenv').config();
const { initDatabase } = require('../config/database');
const browserLane = require('../services/providers/browserLaneDispatcher');
const { migrateProfileSelectors } = require('../services/browserProfileService');
const { latestSelectorVersion } = require('../services/browserSelectorMigration');

async function run() {
  await initDatabase();

  const health = await browserLane.checkWorkerHealth();
  if (!health.configured) {
    console.log('Worker not configured — session API tests skipped (sandbox OK)');
    return;
  }

  const { query, queryOne } = require('../config/database');
  const profile = await queryOne(
    "SELECT id FROM browser_profiles WHERE is_enabled = TRUE ORDER BY id DESC LIMIT 1"
  );

  if (!profile) {
    console.log('No browser profile — creating test profile skipped; worker health OK');
    console.log('Browser session test passed (worker reachable)');
    return;
  }

  const session = await browserLane.getSessionStatus(profile.id);
  if (!session.sessionStatus && session.status) {
    session.sessionStatus = session.status;
  }
  if (!session.sessionStatus) {
    throw new Error('Session status missing from worker');
  }

  const target = latestSelectorVersion('google_voice');
  const migrated = await migrateProfileSelectors(profile.id, target);
  if (migrated.selector_version !== target) {
    throw new Error(`Selector migration failed: ${migrated.selector_version}`);
  }

  const poll = await browserLane.pollInbound(profile.id);
  if (!poll.adapterId) {
    throw new Error('Poll response missing adapterId');
  }

  console.log(`Browser session test passed (profile #${profile.id}, session=${session.sessionStatus}, selectors=${migrated.selector_version})`);
}

run().catch((error) => {
  console.error('FAILED:', error.message);
  process.exit(1);
});
