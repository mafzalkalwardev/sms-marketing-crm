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

async function ensureEsimProvider() {
  const existing = await queryOne("SELECT id FROM providers WHERE provider = 'esim' LIMIT 1");
  if (existing) {
    await query(
      `UPDATE providers SET label = COALESCE(NULLIF(label, ''), 'eSIM Device Agent'),
         adapter_type = 'esim', status = 'active', is_enabled = TRUE, updated_at = NOW()
       WHERE id = $1`,
      [existing.id]
    );
    return existing.id;
  }
  const inserted = await queryOne(
    `INSERT INTO providers (provider, label, adapter_type, status, is_default, is_enabled)
     VALUES ('esim', 'eSIM Device Agent', 'esim', 'active', FALSE, TRUE)
     RETURNING id`
  );
  return inserted?.id || null;
}

async function upsertClicksendFromEnv() {
  if (!process.env.CLICKSEND_USERNAME || !process.env.CLICKSEND_API_KEY) return null;

  const encryptedKey = encryptSecret(process.env.CLICKSEND_USERNAME);
  const encryptedSecret = encryptSecret(process.env.CLICKSEND_API_KEY);

  const existing = await queryOne("SELECT id FROM providers WHERE provider = 'clicksend' LIMIT 1");
  if (existing) {
    await query(
      `UPDATE providers SET
         label = COALESCE(NULLIF(label, ''), 'ClickSend Live'),
         adapter_type = 'api',
         encrypted_api_key = $1,
         encrypted_api_secret = $2,
         status = 'active',
         is_enabled = TRUE,
         updated_at = NOW()
       WHERE id = $3`,
      [encryptedKey, encryptedSecret, existing.id]
    );
    return existing.id;
  }

  const anyDefault = await queryOne('SELECT id FROM providers WHERE is_default = TRUE LIMIT 1');
  const makeDefault = !anyDefault;
  const inserted = await queryOne(
    `INSERT INTO providers (provider, label, adapter_type, encrypted_api_key, encrypted_api_secret, status, is_default, is_enabled)
     VALUES ('clicksend', 'ClickSend Live', 'api', $1, $2, 'active', $3, TRUE)
     RETURNING id`,
    [encryptedKey, encryptedSecret, makeDefault]
  );
  return inserted?.id || null;
}

async function upsertSentFromEnv() {
  if (!process.env.SENT_API_KEY) return null;

  const encryptedKey = encryptSecret(process.env.SENT_API_KEY);
  const encryptedSecret = encryptSecret('sent-api-key-only');
  const extra = {};
  if (process.env.SENT_DEFAULT_FROM) {
    extra.defaultFrom = process.env.SENT_DEFAULT_FROM;
  }
  const encryptedExtra = Object.keys(extra).length ? encryptSecret(JSON.stringify(extra)) : '';

  const existing = await queryOne("SELECT id FROM providers WHERE provider = 'sent' LIMIT 1");
  if (existing) {
    await query(
      `UPDATE providers SET
         label = COALESCE(NULLIF(label, ''), 'Sent Live'),
         adapter_type = 'api',
         encrypted_api_key = $1,
         encrypted_api_secret = $2,
         encrypted_extra_config = COALESCE(NULLIF($3, ''), encrypted_extra_config),
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
     VALUES ('sent', 'Sent Live', 'api', $1, $2, $3, 'active', $4, TRUE)
     RETURNING id`,
    [encryptedKey, encryptedSecret, encryptedExtra, makeDefault]
  );
  return inserted?.id || null;
}

async function ensureSentIsDefaultWhenConfigured() {
  if (!process.env.SENT_API_KEY) return;
  if (String(process.env.SENT_AS_DEFAULT || 'true').toLowerCase() === 'false') return;
  const sent = await queryOne("SELECT id FROM providers WHERE provider = 'sent' AND is_enabled = TRUE LIMIT 1");
  if (!sent) return;
  await query('UPDATE providers SET is_default = FALSE WHERE is_default = TRUE AND id != $1', [sent.id]);
  await query('UPDATE providers SET is_default = TRUE WHERE id = $1', [sent.id]);
}

async function upsertSentNumberFromEnv() {
  const phone = process.env.SENT_DEFAULT_FROM;
  if (!phone) return;

  const inboundExtras = String(process.env.SENT_INBOUND_IDENTIFIERS || '725157')
    .split(',')
    .map((line) => line.trim())
    .filter(Boolean);

  const owner =
    (await queryOne("SELECT id FROM users WHERE email = 'super_admin@signalmint.local' LIMIT 1")) ||
    (await queryOne("SELECT id FROM users WHERE role = 'super_admin' ORDER BY id LIMIT 1")) ||
    (await queryOne("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1"));
  if (!owner) return;

  const normalized = phone.trim();
  const existing = await queryOne('SELECT id, user_id FROM numbers WHERE phone_number = $1 LIMIT 1', [normalized]);
  if (existing) {
    await query(
      `UPDATE numbers SET
         user_id = $1,
         provider = 'sent',
         status = 'active',
         label = COALESCE(NULLIF(label, ''), 'Sent Live'),
         updated_at = NOW()
       WHERE id = $2`,
      [owner.id, existing.id]
    );
  } else {
    await query(
      `INSERT INTO numbers (user_id, workspace_id, organization_id, phone_number, country, type, label, provider, status, is_default)
       VALUES ($1, 1, 1, $2, 'US', 'long-code', 'Sent Live', 'sent', 'active', TRUE)`,
      [owner.id, normalized]
    );
  }

  for (const extra of inboundExtras) {
    const extraNorm = extra.replace(/\D/g, '').length <= 6 ? extra.replace(/\D/g, '') : extra;
    const existingExtra = await queryOne('SELECT id FROM numbers WHERE phone_number = $1 LIMIT 1', [extraNorm]);
    if (existingExtra) {
      await query(
        `UPDATE numbers SET user_id = $1, provider = 'sent', status = 'active', label = 'Sent inbound', updated_at = NOW() WHERE id = $2`,
        [owner.id, existingExtra.id]
      );
    } else {
      await query(
        `INSERT INTO numbers (user_id, workspace_id, organization_id, phone_number, country, type, label, provider, status, is_default)
         VALUES ($1, 1, 1, $2, 'US', 'short-code', 'Sent inbound', 'sent', 'active', FALSE)`,
        [owner.id, extraNorm]
      );
    }
  }
}

async function bootstrapProvidersFromEnv() {
  try {
    await upsertVonageFromEnv();
    await upsertTwilioFromEnv();
    await upsertClicksendFromEnv();
    await upsertSentFromEnv();
    await upsertSentNumberFromEnv();
    await ensureEsimProvider();
    await ensureSentIsDefaultWhenConfigured();
    if (!process.env.SENT_API_KEY) {
      await ensureTwilioIsDefaultWhenPrimary();
    }
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
