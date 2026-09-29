const { MESSAGE_STATUSES } = require('./ProviderAdapter');
const { query, queryOne } = require('../../config/database');
const mockProvider = require('./mockProvider');

async function findActiveProfile(fromNumber) {
  return queryOne(
    `SELECT * FROM esim_profiles
     WHERE phone_number = $1
       AND status IN ('paired', 'active')
       AND agent_token_hash IS NOT NULL
     ORDER BY updated_at DESC
     LIMIT 1`,
    [fromNumber]
  );
}

function isConfigured() {
  return true;
}

async function configuredForLive(credentials = {}, fromNumber = null) {
  const phone = fromNumber || credentials.fromNumber || credentials.phoneNumber;
  if (!phone) return false;
  const profile = await findActiveProfile(phone);
  return Boolean(profile);
}

async function testConnection(credentials = {}) {
  const phone = credentials.fromNumber || credentials.phoneNumber;
  if (!phone) {
    return { ok: true, mode: 'esim', connected: false, note: 'Add an eSIM profile and pair an Android agent' };
  }
  const profile = await findActiveProfile(phone);
  if (!profile) {
    return { ok: false, mode: 'esim', connected: false, error: 'No paired eSIM agent for this number' };
  }
  return {
    ok: true,
    mode: 'esim',
    connected: true,
    profileId: profile.id,
    lastSeenAt: profile.last_seen_at,
  };
}

async function sendSms({ to, from, text, messageId = null, credentials = {} } = {}) {
  const profile = await findActiveProfile(from);
  if (!profile) {
    const mock = await mockProvider.sendSms({ to, from, text, provider: 'esim' });
    return {
      ...mock,
      provider: 'esim',
      mode: 'sandbox',
      note: 'No paired Android agent; message simulated',
    };
  }

  const job = await queryOne(
    `INSERT INTO esim_outbound_jobs (profile_id, message_id, to_number, from_number, body, status)
     VALUES ($1, $2, $3, $4, $5, 'pending')
     RETURNING *`,
    [profile.id, messageId, to, from, text]
  );

  await query(
    `UPDATE esim_profiles SET status = 'active', updated_at = NOW() WHERE id = $1 AND status = 'paired'`,
    [profile.id]
  );

  return {
    ok: true,
    provider: 'esim',
    mode: 'esim',
    providerMessageId: `esim_job_${job.id}`,
    status: MESSAGE_STATUSES.ACCEPTED,
    jobId: job.id,
  };
}

function normalizeInbound(body) {
  return {
    from: String(body.from || '').trim(),
    to: String(body.to || '').trim(),
    text: body.text || body.message || body.body || '',
    providerMessageId: body.providerMessageId || body.messageId || body.id || null,
  };
}

function normalizeStatus(body) {
  return {
    providerMessageId: body.providerMessageId || body.messageId || body.id || null,
    status: body.status || MESSAGE_STATUSES.SENT,
    errorMessage: body.error || body.errorMessage || null,
  };
}

module.exports = {
  id: 'esim',
  label: 'eSIM Device Agent',
  lane: 'esim',
  isConfigured,
  configuredForLive,
  testConnection,
  sendSms,
  normalizeInbound,
  normalizeStatus,
  findActiveProfile,
  mapStatus: (raw) => {
    const value = String(raw ?? '').toLowerCase();
    if (['accepted', 'queued', 'pending'].includes(value)) return MESSAGE_STATUSES.ACCEPTED;
    if (value === 'sent') return MESSAGE_STATUSES.SENT;
    if (value === 'delivered') return MESSAGE_STATUSES.DELIVERED;
    if (['failed', 'undeliverable', 'rejected'].includes(value)) return MESSAGE_STATUSES.FAILED;
    return value || MESSAGE_STATUSES.UNKNOWN;
  },
};
