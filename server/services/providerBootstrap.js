const { query, queryOne } = require('../config/database');
const { encryptSecret } = require('../utils/crypto');
const vonageProvider = require('./providers/vonageProvider');
const twilioProvider = require('./providers/twilioProvider');

async function bootstrapProvidersFromEnv() {
  const existing = await queryOne('SELECT id FROM providers LIMIT 1');
  if (existing) return;

  if (process.env.VONAGE_API_KEY && process.env.VONAGE_API_SECRET) {
    try {
      await query(
        `INSERT INTO providers (provider, label, adapter_type, encrypted_api_key, encrypted_api_secret, status, is_default, is_enabled)
         VALUES ('vonage', 'Vonage (bootstrap)', 'api', $1, $2, 'active', TRUE, TRUE)`,
        [encryptSecret(process.env.VONAGE_API_KEY), encryptSecret(process.env.VONAGE_API_SECRET)]
      );
    } catch { /* ignore */ }
  }

  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      await query(
        `INSERT INTO providers (provider, label, adapter_type, encrypted_api_key, encrypted_api_secret, encrypted_extra_config, status, is_enabled)
         VALUES ('twilio', 'Twilio (bootstrap)', 'api', $1, $2, $3, 'active', TRUE)`,
        [
          encryptSecret(process.env.TWILIO_ACCOUNT_SID),
          encryptSecret(process.env.TWILIO_AUTH_TOKEN),
          encryptSecret(JSON.stringify({ accountSid: process.env.TWILIO_ACCOUNT_SID })),
        ]
      );
    } catch { /* ignore */ }
  }
}

function envProviderMode() {
  if (vonageProvider.configuredForLive()) return 'live';
  if (twilioProvider.isConfigured({})) return 'live';
  return 'mock';
}

module.exports = { bootstrapProvidersFromEnv, envProviderMode };
