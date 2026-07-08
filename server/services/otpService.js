const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query, queryOne } = require('../config/database');
const { sendEmail } = require('./emailService');
const { sendAuthSms } = require('./authSmsService');

const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES || 10);
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);

function generateCode() {
  return String(crypto.randomInt(100000, 999999));
}

async function invalidateChannelCodes(userId, channel) {
  await query(
    `UPDATE verification_codes SET consumed_at = NOW()
     WHERE user_id = $1 AND channel = $2 AND consumed_at IS NULL`,
    [userId, channel]
  );
}

async function issueOtp(userId, channel) {
  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 8);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
  await invalidateChannelCodes(userId, channel);
  await query(
    `INSERT INTO verification_codes (user_id, channel, code_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, channel, codeHash, expiresAt]
  );
  return code;
}

async function sendEmailOtp(user) {
  const code = await issueOtp(user.id, 'email');
  await sendEmail({
    to: user.email,
    subject: 'SignalMint verification code',
    text: `Your SignalMint email verification code is: ${code}\n\nIt expires in ${OTP_EXPIRY_MINUTES} minutes.`,
  });
  return { ok: true, channel: 'email' };
}

async function sendSmsOtp(user) {
  if (!user.phone) {
    const error = new Error('Phone number is required for SMS verification');
    error.status = 400;
    throw error;
  }
  const code = await issueOtp(user.id, 'sms');
  await sendAuthSms({
    to: user.phone,
    message: `SignalMint verification code: ${code}. Expires in ${OTP_EXPIRY_MINUTES} minutes.`,
  });
  return { ok: true, channel: 'sms' };
}

async function verifyOtp(userId, channel, code) {
  const row = await queryOne(
    `SELECT * FROM verification_codes
     WHERE user_id = $1 AND channel = $2 AND consumed_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [userId, channel]
  );
  if (!row) {
    const error = new Error('No active verification code. Request a new one.');
    error.status = 400;
    throw error;
  }
  if (new Date(row.expires_at) < new Date()) {
    const error = new Error('Verification code expired. Request a new one.');
    error.status = 400;
    throw error;
  }
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    const error = new Error('Too many attempts. Request a new code.');
    error.status = 429;
    throw error;
  }
  const match = await bcrypt.compare(String(code), row.code_hash);
  if (!match) {
    await query('UPDATE verification_codes SET attempts = attempts + 1 WHERE id = $1', [row.id]);
    const error = new Error('Invalid verification code');
    error.status = 400;
    throw error;
  }
  await query('UPDATE verification_codes SET consumed_at = NOW() WHERE id = $1', [row.id]);
  if (channel === 'email') {
    await query('UPDATE users SET email_verified_at = NOW(), updated_at = NOW() WHERE id = $1', [userId]);
  } else {
    await query('UPDATE users SET phone_verified_at = NOW(), updated_at = NOW() WHERE id = $1', [userId]);
  }
  return { ok: true, channel };
}

async function advanceVerificationStatus(userId) {
  const user = await queryOne('SELECT * FROM users WHERE id = $1', [userId]);
  if (!user) return null;
  if (!user.email_verified_at || !user.phone_verified_at) {
    return user;
  }
  if (user.status === 'pending_verification') {
    const requireApproval = process.env.REQUIRE_ADMIN_APPROVAL !== 'false';
    const nextStatus = requireApproval ? 'pending_approval' : 'active';
    await query('UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2', [nextStatus, userId]);
    return queryOne('SELECT * FROM users WHERE id = $1', [userId]);
  }
  return user;
}

module.exports = {
  sendEmailOtp,
  sendSmsOtp,
  verifyOtp,
  advanceVerificationStatus,
  issueOtp,
  OTP_EXPIRY_MINUTES,
};
