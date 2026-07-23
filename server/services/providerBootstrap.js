const { query, queryOne } = require('../config/database');
const { encryptSecret } = require('../utils/crypto');
const vonageProvider = require('./providers/vonageProvider');
const twilioProvider = require('./providers/twilioProvider');

async function upsertTwilioFromEnv() {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return null;

  const encryptedKey = encryptSecret(process.env.TWILIO_ACCOUNT_SID);
  const encryptedSecret = encryptSecret(process.env.TWILIO_AUTH_TOKEN);
  const encryptedExtra = encryptSecret(JSON.stringify({ accountSid: process.env.TWILIO_ACCOUNT_SID }));

  const existing = await queryOne("SELECT id, is_default FROM providers WHERE provider = 'twilio' LIMIT 1");
  if (existing) {
    await query(
      `UPDATE providers SET
         label = COALESCE(NULLIF(label, ''), 'Twilio Live'),
         adapter_type = 'api',
         encrypted_api_key = $1,
         encrypted_api_secret = $2,
         encrypted_extra_config = $3,
         status = 'active',
         is_enabled = TRUE,
         updated_at = NOW()
       WHERE id = $4`,
      [encryptedKey, encryptedSecret, encryptedExtra, existing.id]
    );
    return existing.id;
  }

  const anyDefault = await queryOne('SELECT id FROM providers WHERE is_default = TRUE LIMIT 1');
  const makeDefault = !anyDefault;
  const inserted = await queryOne(
    `INSERT INTO providers (provider, label, adapter_type, encrypted_api_key, encrypted_api_secret, encrypted_extra_config, status, is_default, is_enabled)
     VALUES ('twilio', 'Twilio Live', 'api', $1, $2, $3, 'active', $4, TRUE)
     RETURNING id`,
    [encryptedKey, encryptedSecret, encryptedExtra, makeDefault]
  );
  return inserted?.id || null;
}

async function upsertVonageFromEnv() {
  if (!process.env.VONAGE_API_KEY || !process.env.VONAGE_API_SECRET) return null;

  const existing = await queryOne("SELECT id FROM providers WHERE provider = 'vonage' LIMIT 1");
  if (existing) {
    await query(
      `UPDATE providers SET
         encrypted_api_key = $1,
         encrypted_api_secret = $2,
         status = 'active',
         is_enabled = TRUE,
         updated_at = NOW()
       WHERE id = $3`,
      [encryptSecret(process.env.VONAGE_API_KEY), encryptSecret(process.env.VONAGE_API_SECRET), existing.id]
    );
    return existing.id;
  }

  const anyProvider = await queryOne('SELECT id FROM providers LIMIT 1');
  const makeDefault = !anyProvider;
  const inserted = await queryOne(
    `INSERT INTO providers (provider, label, adapter_type, encrypted_api_key, encrypted_api_secret, status, is_default, is_enabled)
     VALUES ('vonage', 'Vonage Live', 'api', $1, $2, 'active', $3, TRUE)
     RETURNING id`,
    [encryptSecret(process.env.VONAGE_API_KEY), encryptSecret(process.env.VONAGE_API_SECRET), makeDefault]
  );
  return inserted?.id || null;
}

async function promoteOrgsToLiveIfConfigured() {
  if (String(process.env.SMS_SANDBOX_MODE || '').toLowerCase() !== 'false') return;
  if (String(process.env.AUTO_LIVE_ORGS || 'true').toLowerCase() === 'false') return;

  await query(
    `UPDATE organizations
     SET delivery_mode = 'live',
         approved_for_live_at = COALESCE(approved_for_live_at, NOW()),
         updated_at = NOW()
     WHERE status = 'active' AND delivery_mode IS DISTINCT FROM 'live'`
  );
}

async function ensureTwilioIsDefaultWhenPrimary() {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return;
  const twilio = await queryOne("SELECT id FROM providers WHERE provider = 'twilio' AND is_enabled = TRUE LIMIT 1");
  if (!twilio) return;
  await query('UPDATE providers SET is_default = FALSE WHERE is_default = TRUE AND id != $1', [twilio.id]);
  await query('UPDATE providers SET is_default = TRUE WHERE id = $1', [twilio.id]);
}

async function bootstrapProvidersFromEnv() {
  try {
    await upsertVonageFromEnv();
    await upsertTwilioFromEnv();
    await ensureTwilioIsDefaultWhenPrimary();
    await promoteOrgsToLiveIfConfigured();
  } catch (error) {
    console.warn('[bootstrapProvidersFromEnv]', error.message || error);
  }
}

function envProviderMode() {
  if (vonageProvider.configuredForLive()) return 'live';
  if (twilioProvider.isConfigured({})) return 'live';
  return 'mock';
}

module.exports = { bootstrapProvidersFromEnv, envProviderMode };
