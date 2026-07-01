require('dotenv').config();
const { initDatabase } = require('../config/database');
const { getLiveReadiness } = require('../services/liveReadinessService');
const { checkAllProviders } = require('../services/providerHealthScheduler');

async function run() {
  await initDatabase();

  const readiness = getLiveReadiness();
  if (typeof readiness.sandboxMode !== 'boolean') {
    throw new Error('liveReadiness.sandboxMode missing');
  }
  if (!readiness.publicBackendUrl || typeof readiness.publicBackendUrl.ok !== 'boolean') {
    throw new Error('liveReadiness.publicBackendUrl missing');
  }
  if (!Array.isArray(readiness.blockers)) {
    throw new Error('liveReadiness.blockers must be an array');
  }
  if (!readiness.vonage || !readiness.twilio) {
    throw new Error('Provider readiness blocks missing');
  }

  await checkAllProviders();

  console.log('Live readiness check passed');
  console.log(`  Mode:        ${readiness.deliveryMode}`);
  console.log(`  Sandbox:     ${readiness.sandboxMode}`);
  console.log(`  Public URL:  ${readiness.publicBackendUrl.ok ? readiness.publicBackendUrl.value : 'not set'}`);
  console.log(`  Blockers:    ${readiness.blockers.length ? readiness.blockers.join('; ') : 'none'}`);
  console.log(`  Webhook base: ${readiness.webhookBaseUrl}`);
}

run().catch((error) => {
  console.error('FAILED:', error.message);
  process.exit(1);
});
