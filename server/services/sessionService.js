const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { query, queryOne, queryAll } = require('../config/database');

const SESSION_DAYS = 7;

function sessionExpiry() {
  return new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
}

async function createSession(user, { ip, userAgent, impersonatedBy } = {}) {
  const jti = crypto.randomUUID();
  const expiresAt = sessionExpiry();
  const session = await queryOne(
    `INSERT INTO auth_sessions (user_id, token_jti, ip_address, user_agent, impersonated_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [user.id, jti, ip || null, userAgent || null, impersonatedBy || null, expiresAt]
  );
  const payload = { id: user.id, jti };
  if (impersonatedBy) payload.impersonated_by = impersonatedBy;
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: `${SESSION_DAYS}d` });
  return { token, jti, sessionId: session.id, expiresAt };
}

async function validateSession(jti) {
  if (!jti) return false;
  const row = await queryOne(
    `SELECT id FROM auth_sessions
     WHERE token_jti = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
    [jti]
  );
  return Boolean(row);
}

async function revokeSession(jti) {
  if (!jti) return;
  await query('UPDATE auth_sessions SET revoked_at = NOW() WHERE token_jti = $1', [jti]);
}

async function revokeAllSessions(userId) {
  await query(
    'UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId]
  );
}

async function listSessions(userId) {
  return queryAll(
    `SELECT id, token_jti, ip_address, user_agent, impersonated_by, expires_at, created_at, revoked_at
     FROM auth_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [userId]
  );
}

async function logLogin({ userId, email, success, ip, userAgent, failureReason }) {
  await query(
    `INSERT INTO login_events (user_id, email, success, ip_address, user_agent, failure_reason)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId || null, email || null, Boolean(success), ip || null, userAgent || null, failureReason || null]
  );
}

module.exports = {
  createSession,
  validateSession,
  revokeSession,
  revokeAllSessions,
  listSessions,
  logLogin,
  sessionExpiry,
};
