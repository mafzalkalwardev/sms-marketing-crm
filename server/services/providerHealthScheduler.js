const { query, queryAll } = require('../config/database');
const { testProviderConnection } = require('./providerConnectionService');
const { getLiveReadiness } = require('./liveReadinessService');

let timer = null;

async function checkAllProviders() {
  const providers = await queryAll(
    "SELECT * FROM providers WHERE is_enabled = TRUE AND adapter_type = 'api'"
  );

  for (const provider of providers) {
    try {
      const result = await testProviderConnection(provider);
      await query(
        `UPDATE providers
         SET health_ok = $1,
             health_checked_at = NOW(),
             health_error = $2,
             health_mode = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [Boolean(result.ok), result.error || null, result.mode || null, provider.id]
      );
    } catch (error) {
      await query(
        `UPDATE providers
         SET health_ok = FALSE,
             health_checked_at = NOW(),
             health_error = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [error.message, provider.id]
      );
    }
  }
}

function startProviderHealthScheduler() {
  if (process.env.PROVIDER_HEALTH_ENABLED === 'false') return;
  const intervalMs = Number(process.env.PROVIDER_HEALTH_INTERVAL_MS || 300000);
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    checkAllProviders().catch((err) => console.error('Provider health check error:', err.message));
  }, intervalMs);
  checkAllProviders().catch((err) => console.error('Initial provider health check error:', err.message));
  const readiness = getLiveReadiness();
  if (!readiness.publicBackendUrl.ok && process.env.NODE_ENV === 'production') {
    console.warn('PUBLIC_BACKEND_URL is not set — Twilio webhook signatures will fail in production');
  }
  console.log(`Provider health scheduler started (${intervalMs}ms)`);
}

function stopProviderHealthScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  startProviderHealthScheduler,
  stopProviderHealthScheduler,
  checkAllProviders,
};
