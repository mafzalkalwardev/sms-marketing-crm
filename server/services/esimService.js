const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { query, queryOne, queryAll, withTransaction } = require('../config/database');
const { encryptSecret, decryptSecret } = require('../utils/crypto');
const { normalizePhone, isValidPhone } = require('../lib/sms');
const { resolveTenancy } = require('./tenancyService');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'esim-qr');

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function generatePairingCode() {
  return String(crypto.randomInt(100000, 999999));
}

function generateAgentToken() {
  return crypto.randomBytes(32).toString('hex');
}

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

function looksLikeLpa(value) {
  const text = String(value || '').trim();
  return /^LPA:1\$/i.test(text) || /^1\$[^$]+\$/.test(text);
}

function normalizeLpa(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^LPA:/i.test(text)) return text;
  if (/^1\$/.test(text)) return `LPA:${text}`;
  return text;
}

async function decodeQrFromBuffer(buffer) {
  let Jimp;
  let jsQR;
  try {
    Jimp = require('jimp');
    jsQR = require('jsqr');
  } catch {
    const error = new Error('QR decode dependencies missing. Paste the LPA string instead, or run npm install in server.');
    error.status = 400;
    throw error;
  }

  const image = await Jimp.read(buffer);
  const { data, width, height } = image.bitmap;
  const code = jsQR(new Uint8ClampedArray(data), width, height);
  if (!code?.data) {
    const error = new Error('Could not read a QR code from the image. Paste the LPA string instead.');
    error.status = 400;
    throw error;
  }
  return String(code.data).trim();
}

async function getEsimProviderRow() {
  let row = await queryOne("SELECT * FROM providers WHERE provider = 'esim' AND is_enabled = TRUE LIMIT 1");
  if (!row) {
    row = await queryOne(
      `INSERT INTO providers (provider, label, adapter_type, status, is_default, is_enabled)
       VALUES ('esim', 'eSIM Device Agent', 'esim', 'active', FALSE, TRUE)
       RETURNING *`
    );
  }
  return row;
}

function publicProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    organizationId: row.organization_id,
    numberId: row.number_id,
    phoneNumber: row.phone_number,
    status: row.status,
    label: row.label,
    hasLpa: Boolean(row.encrypted_lpa),
    agentDeviceId: row.agent_device_id,
    lastSeenAt: row.last_seen_at,
    pairingCode: row.pairing_code,
    pairingExpiresAt: row.pairing_expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listProfilesForUser(userId) {
  const rows = await queryAll(
    `SELECT * FROM esim_profiles
     WHERE user_id = $1 AND status IS DISTINCT FROM 'disabled'
     ORDER BY id DESC`,
    [userId]
  );
  return rows.map(publicProfile);
}

async function createProfile(user, { phoneNumber, lpa, label, qrBuffer = null }) {
  const phone = normalizePhone(phoneNumber);
  if (!isValidPhone(phone)) {
    const error = new Error('Phone number must be valid E.164 format');
    error.status = 400;
    throw error;
  }

  let activation = normalizeLpa(lpa);
  let qrImagePath = null;

  if (qrBuffer && qrBuffer.length) {
    ensureUploadDir();
    if (!activation) {
      activation = normalizeLpa(await decodeQrFromBuffer(qrBuffer));
    }
    const filename = `esim_${user.id}_${Date.now()}.bin`;
    qrImagePath = path.join(UPLOAD_DIR, filename);
    fs.writeFileSync(qrImagePath, qrBuffer);
  }

  if (!activation && !(qrBuffer && qrBuffer.length)) {
    const error = new Error('Upload an eSIM QR image or paste the LPA activation string');
    error.status = 400;
    throw error;
  }

  if (!activation) {
    const error = new Error('Could not determine an activation code from the QR image. Paste the LPA string instead.');
    error.status = 400;
    throw error;
  }

  if (!qrBuffer && !looksLikeLpa(activation)) {
    const error = new Error('Activation code should look like LPA:1$smdp.example.com$...');
    error.status = 400;
    throw error;
  }

  const existing = await queryOne(
    `SELECT id FROM esim_profiles
     WHERE user_id = $1 AND phone_number = $2 AND status IS DISTINCT FROM 'disabled'`,
    [user.id, phone]
  );
  if (existing) {
    const error = new Error('An eSIM profile already exists for this number');
    error.status = 409;
    throw error;
  }

  const { organizationId, workspaceId } = await resolveTenancy(user);
  const provider = await getEsimProviderRow();
  const encryptedLpa = activation ? encryptSecret(activation) : null;

  return withTransaction(async (tx) => {
    await tx.query('UPDATE numbers SET is_default = FALSE WHERE user_id = $1', [user.id]);

    const number = await tx.queryOne(
      `INSERT INTO numbers (
         user_id, workspace_id, organization_id, provider_id, provider,
         phone_number, country, type, label, status, is_default
       ) VALUES ($1, $2, $3, $4, 'esim', $5, 'US', 'esim', $6, 'active', TRUE)
       RETURNING *`,
      [user.id, workspaceId, organizationId, provider.id, phone, label || 'eSIM line']
    );

    const profile = await tx.queryOne(
      `INSERT INTO esim_profiles (
         user_id, organization_id, number_id, phone_number, encrypted_lpa,
         qr_image_path, status, label
       ) VALUES ($1, $2, $3, $4, $5, $6, 'pending_install', $7)
       RETURNING *`,
      [user.id, organizationId, number.id, phone, encryptedLpa, qrImagePath, label || 'eSIM line']
    );

    return publicProfile(profile);
  });
}

async function mintPairingCode(userId, profileId) {
  const profile = await queryOne(
    'SELECT * FROM esim_profiles WHERE id = $1 AND user_id = $2 AND status IS DISTINCT FROM $3',
    [profileId, userId, 'disabled']
  );
  if (!profile) {
    const error = new Error('eSIM profile not found');
    error.status = 404;
    throw error;
  }

  const code = generatePairingCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const updated = await queryOne(
    `UPDATE esim_profiles
     SET pairing_code = $1, pairing_expires_at = $2, updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [code, expiresAt.toISOString(), profileId]
  );

  return {
    ...publicProfile(updated),
    pairingCode: code,
    pairingExpiresAt: expiresAt.toISOString(),
    instructions: [
      'Install the eSIM on your Android phone (Settings → Network → SIMs → Download/Add eSIM → scan QR).',
      'Install the SignalMint eSIM Agent APK.',
      'Enter this server URL and the pairing code in the agent.',
    ],
  };
}

async function disableProfile(userId, profileId) {
  const profile = await queryOne(
    'SELECT * FROM esim_profiles WHERE id = $1 AND user_id = $2',
    [profileId, userId]
  );
  if (!profile) {
    const error = new Error('eSIM profile not found');
    error.status = 404;
    throw error;
  }

  await query(
    `UPDATE esim_profiles
     SET status = 'disabled', agent_token_hash = NULL, pairing_code = NULL, updated_at = NOW()
     WHERE id = $1`,
    [profileId]
  );
  if (profile.number_id) {
    await query(
      `UPDATE numbers SET status = 'inactive', updated_at = NOW() WHERE id = $1`,
      [profile.number_id]
    );
  }
  return { ok: true };
}

async function pairAgent({ pairingCode, deviceId }) {
  const code = String(pairingCode || '').trim();
  const device = String(deviceId || '').trim();
  if (!code || !device) {
    const error = new Error('pairingCode and deviceId are required');
    error.status = 400;
    throw error;
  }

  const profile = await queryOne(
    `SELECT * FROM esim_profiles
     WHERE pairing_code = $1
       AND pairing_expires_at > NOW()
       AND status IS DISTINCT FROM 'disabled'
     LIMIT 1`,
    [code]
  );
  if (!profile) {
    const error = new Error('Invalid or expired pairing code');
    error.status = 401;
    throw error;
  }

  const token = generateAgentToken();
  const updated = await queryOne(
    `UPDATE esim_profiles
     SET status = 'paired',
         agent_device_id = $1,
         agent_token_hash = $2,
         pairing_code = NULL,
         pairing_expires_at = NULL,
         last_seen_at = NOW(),
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [device, hashToken(token), profile.id]
  );

  return {
    token,
    profile: publicProfile(updated),
    phoneNumber: updated.phone_number,
  };
}

async function authenticateAgent(token) {
  if (!token) return null;
  const profile = await queryOne(
    `SELECT * FROM esim_profiles
     WHERE agent_token_hash = $1
       AND status IN ('paired', 'active')
     LIMIT 1`,
    [hashToken(token)]
  );
  if (!profile) return null;
  await query('UPDATE esim_profiles SET last_seen_at = NOW(), updated_at = NOW() WHERE id = $1', [profile.id]);
  return profile;
}

async function claimJobs(profile, { limit = 5 } = {}) {
  const max = Math.min(Number(limit) || 5, 20);
  const jobs = await withTransaction(async (tx) => {
    const pending = await tx.query(
      `SELECT id FROM esim_outbound_jobs
       WHERE profile_id = $1 AND status = 'pending'
       ORDER BY id ASC
       LIMIT $2
       FOR UPDATE SKIP LOCKED`,
      [profile.id, max]
    );
    if (!pending.rows.length) return [];

    const ids = pending.rows.map((row) => row.id);
    const claimed = await tx.query(
      `UPDATE esim_outbound_jobs
       SET status = 'claimed', claimed_at = NOW(), updated_at = NOW()
       WHERE id = ANY($1::int[])
       RETURNING *`,
      [ids]
    );
    return claimed.rows;
  });

  return jobs.map((job) => ({
    id: job.id,
    messageId: job.message_id,
    to: job.to_number,
    from: job.from_number,
    text: job.body,
  }));
}

async function completeJob(profile, jobId, { status, errorMessage = null } = {}) {
  const job = await queryOne(
    'SELECT * FROM esim_outbound_jobs WHERE id = $1 AND profile_id = $2',
    [jobId, profile.id]
  );
  if (!job) {
    const error = new Error('Job not found');
    error.status = 404;
    throw error;
  }

  const ok = ['sent', 'delivered'].includes(String(status || '').toLowerCase());
  const nextStatus = ok ? 'sent' : 'failed';
  await query(
    `UPDATE esim_outbound_jobs
     SET status = $1, error_message = $2, completed_at = NOW(), updated_at = NOW()
     WHERE id = $3`,
    [nextStatus, errorMessage, jobId]
  );

  if (job.message_id) {
    const messageStateService = require('./messageStateService');
    const { MESSAGE_STATUSES } = require('./providers/ProviderAdapter');
    await messageStateService.transitionMessage(
      job.message_id,
      ok ? MESSAGE_STATUSES.SENT : MESSAGE_STATUSES.FAILED,
      {
        source: 'esim_agent',
        providerMessageId: `esim_job_${job.id}`,
        errorMessage: errorMessage || null,
        internalErrorCode: ok ? null : 'esim_agent_failed',
      }
    );
  }

  return { ok: true, status: nextStatus };
}

function getStoredLpa(profile) {
  if (!profile?.encrypted_lpa) return null;
  try {
    return decryptSecret(profile.encrypted_lpa);
  } catch {
    return null;
  }
}

module.exports = {
  listProfilesForUser,
  createProfile,
  mintPairingCode,
  disableProfile,
  pairAgent,
  authenticateAgent,
  claimJobs,
  completeJob,
  publicProfile,
  getStoredLpa,
  decodeQrFromBuffer,
  looksLikeLpa,
  normalizeLpa,
  hashToken,
};
