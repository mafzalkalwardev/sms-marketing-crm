const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { query, queryOne, queryAll } = require('../config/database');
const { logAudit } = require('./auditService');

function generateApiKey() {
  const secret = crypto.randomBytes(24).toString('hex');
  return `smk_${secret}`;
}

function keyPrefix(rawKey) {
  return rawKey.slice(0, 12);
}

async function createApiKey({ user, name, scopes }) {
  const rawKey = generateApiKey();
  const prefix = keyPrefix(rawKey);
  const hash = await bcrypt.hash(rawKey, 10);
  const defaultScopes = ['contacts:read', 'messages:send'];
  const resolvedScopes = Array.isArray(scopes) && scopes.length ? scopes : defaultScopes;

  const row = await queryOne(
    `INSERT INTO api_keys (organization_id, workspace_id, user_id, name, key_prefix, key_hash, scopes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, name, key_prefix, scopes, created_at`,
    [
      user.organization_id || 1,
      user.workspace_id || 1,
      user.id,
      name || 'Integration key',
      prefix,
      hash,
      resolvedScopes,
    ]
  );

  await logAudit({
    actorUserId: user.id,
    action: 'api_key_created',
    details: { keyId: row.id, name: row.name, prefix: row.key_prefix },
  });

  return { ...row, key: rawKey };
}

async function listApiKeys(user) {
  return queryAll(
    `SELECT id, name, key_prefix, scopes, last_used_at, revoked_at, created_at
     FROM api_keys
     WHERE organization_id = $1 AND revoked_at IS NULL
     ORDER BY created_at DESC`,
    [user.organization_id || 1]
  );
}

async function revokeApiKey({ user, keyId }) {
  const key = await queryOne(
    'SELECT * FROM api_keys WHERE id = $1 AND organization_id = $2',
    [keyId, user.organization_id || 1]
  );
  if (!key) {
    const error = new Error('API key not found');
    error.status = 404;
    throw error;
  }
  if (key.revoked_at) return { ok: true, alreadyRevoked: true };

  await query('UPDATE api_keys SET revoked_at = NOW() WHERE id = $1', [keyId]);
  await logAudit({
    actorUserId: user.id,
    action: 'api_key_revoked',
    details: { keyId, name: key.name, prefix: key.key_prefix },
  });
  return { ok: true };
}

async function authenticateApiKey(rawKey) {
  if (!rawKey || !rawKey.startsWith('smk_')) return null;
  const prefix = keyPrefix(rawKey);
  const row = await queryOne(
    `SELECT ak.*, u.role, u.status, u.name, u.email
     FROM api_keys ak
     JOIN users u ON u.id = ak.user_id
     WHERE ak.key_prefix = $1 AND ak.revoked_at IS NULL`,
    [prefix]
  );
  if (!row || row.status !== 'active') return null;
  if (!await bcrypt.compare(rawKey, row.key_hash)) return null;

  await query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [row.id]);

  return {
    apiKeyId: row.id,
    scopes: row.scopes || [],
    user: {
      id: row.user_id,
      name: row.name,
      email: row.email,
      role: row.role,
      status: row.status,
      organization_id: row.organization_id,
      workspace_id: row.workspace_id,
    },
  };
}

function hasScope(scopes, required) {
  return (scopes || []).includes(required) || (scopes || []).includes('*');
}

module.exports = {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  authenticateApiKey,
  hasScope,
};
