const { query, queryOne, queryAll } = require('../config/database');
const { encryptSecret, decryptSecret } = require('../utils/crypto');
const {
  defaultSelectorsForAdapter,
  defaultBaseUrlForAdapter,
} = require('./browser/selectorTemplates');
const { selectorsForVersion, latestSelectorVersion } = require('./browserSelectorMigration');

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function listProfiles() {
  return queryAll(
    `SELECT bp.*, p.provider, p.label AS provider_label, p.status AS provider_status
     FROM browser_profiles bp
     LEFT JOIN providers p ON p.id = bp.provider_id
     ORDER BY bp.created_at DESC`
  );
}

async function getProfile(id) {
  return queryOne(
    `SELECT bp.*, p.provider, p.label AS provider_label
     FROM browser_profiles bp
     LEFT JOIN providers p ON p.id = bp.provider_id
     WHERE bp.id = $1`,
    [id]
  );
}

async function getProfileByProviderId(providerId) {
  return queryOne(
    `SELECT bp.*, p.provider, p.label AS provider_label
     FROM browser_profiles bp
     LEFT JOIN providers p ON p.id = bp.provider_id
     WHERE bp.provider_id = $1 AND bp.is_enabled = TRUE
     ORDER BY bp.id DESC
     LIMIT 1`,
    [providerId]
  );
}

function buildWorkerPayload(profile, { to, text }) {
  const selectors = parseJson(
    profile.selector_json,
    selectorsForVersion(profile.adapter_id, profile.selector_version || 'v1')
  );
  let profilePath = '';
  if (profile.profile_path_encrypted) {
    try {
      profilePath = decryptSecret(profile.profile_path_encrypted);
    } catch {
      profilePath = '';
    }
  }
  return {
    profileId: profile.id,
    providerId: profile.provider_id,
    adapterId: profile.adapter_id,
    engine: profile.engine || 'playwright_persistent',
    baseUrl: profile.base_url || defaultBaseUrlForAdapter(profile.adapter_id),
    selectors,
    profilePath,
    to,
    text,
    rateLimitPerSecond: profile.rate_limit_per_second || 1,
    dailyCap: profile.daily_cap || null,
  };
}

async function createProfileForProvider({
  providerId,
  adapterId,
  label,
  baseUrl,
  engine = 'playwright_persistent',
  selectors,
  organizationId = 1,
}) {
  const profileDir = `profiles/${adapterId}_${providerId}`;
  const selectorVersion = latestSelectorVersion(adapterId);
  const selectorJson = selectors || selectorsForVersion(adapterId, selectorVersion);
  const resolvedBaseUrl = defaultBaseUrlForAdapter(adapterId, baseUrl);

  const row = await queryOne(
    `INSERT INTO browser_profiles (
      provider_id, organization_id, adapter_id, label, engine, profile_path_encrypted,
      base_url, selector_json, selector_version, session_status, poll_interval_seconds, rate_limit_per_second, is_enabled
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, 'logged_out', 15, 1, TRUE)
    RETURNING *`,
    [
      providerId,
      organizationId,
      adapterId,
      label || adapterId,
      engine,
      encryptSecret(profileDir),
      resolvedBaseUrl,
      JSON.stringify(selectorJson),
      selectorVersion,
    ]
  );
  return row;
}

async function updateProfile(id, updates) {
  const fields = [];
  const values = [];
  let idx = 1;

  const allowed = {
    label: 'label',
    engine: 'engine',
    base_url: 'baseUrl',
    session_status: 'sessionStatus',
    poll_interval_seconds: 'pollIntervalSeconds',
    rate_limit_per_second: 'rateLimitPerSecond',
    daily_cap: 'dailyCap',
    is_enabled: 'isEnabled',
  };

  for (const [column, key] of Object.entries(allowed)) {
    if (updates[key] !== undefined) {
      fields.push(`${column} = $${idx}`);
      values.push(updates[key]);
      idx += 1;
    }
  }

  if (updates.selectors) {
    fields.push(`selector_json = $${idx}::jsonb`);
    values.push(JSON.stringify(updates.selectors));
    idx += 1;
  }

  if (!fields.length) return getProfile(id);

  values.push(id);
  return queryOne(
    `UPDATE browser_profiles SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
    values
  );
}

async function recordJob({ profileId, providerId, messageId, jobType, status, payload, result, errorMessage }) {
  return queryOne(
    `INSERT INTO browser_jobs (
      browser_profile_id, provider_id, message_id, job_type, status, payload, result, error_message
    ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)
    RETURNING *`,
    [
      profileId,
      providerId || null,
      messageId || null,
      jobType,
      status,
      JSON.stringify(payload || {}),
      result ? JSON.stringify(result) : null,
      errorMessage || null,
    ]
  );
}

async function touchPoll(id) {
  await query('UPDATE browser_profiles SET last_poll_at = NOW(), last_session_check_at = NOW(), updated_at = NOW() WHERE id = $1', [id]);
}

async function migrateProfileSelectors(profileId, targetVersion) {
  const profile = await getProfile(profileId);
  if (!profile) {
    const error = new Error('Browser profile not found');
    error.status = 404;
    throw error;
  }
  const { migrateSelectors } = require('./browserSelectorMigration');
  const migration = migrateSelectors(profile.adapter_id, profile.selector_version || 'v1', targetVersion);
  return queryOne(
    `UPDATE browser_profiles
     SET selector_json = $1::jsonb, selector_version = $2, updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [JSON.stringify(migration.selectors), migration.toVersion, profileId]
  );
}

async function updateInboundCursor(profileId, cursor) {
  await query(
    'UPDATE browser_profiles SET inbound_cursor = $1::jsonb, updated_at = NOW() WHERE id = $2',
    [JSON.stringify(cursor || {}), profileId]
  );
}

module.exports = {
  listProfiles,
  getProfile,
  getProfileByProviderId,
  buildWorkerPayload,
  createProfileForProvider,
  updateProfile,
  recordJob,
  touchPoll,
  parseJson,
  migrateProfileSelectors,
  updateInboundCursor,
};
