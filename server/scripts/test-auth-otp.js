require('dotenv').config({ quiet: true });

process.env.OTP_LOG_TO_CONSOLE = 'true';

const { initDatabase, query, queryOne } = require('../config/database');
const { issueOtp, verifyOtp, OTP_EXPIRY_MINUTES } = require('../services/otpService');
const bcrypt = require('bcryptjs');

async function run() {
  await initDatabase();
  const stamp = Date.now();
  const email = `otp-unit-${stamp}@example.com`;

  const user = await queryOne(
    `INSERT INTO users (name, email, password_hash, phone, role, status)
     VALUES ('OTP Test', $1, 'hash', '+15550990001', 'user', 'pending_verification') RETURNING *`,
    [email]
  );

  const code = await issueOtp(user.id, 'email');
  if (!/^\d{6}$/.test(code)) throw new Error('OTP format invalid');

  await verifyOtp(user.id, 'email', code);

  const updated = await queryOne('SELECT email_verified_at FROM users WHERE id = $1', [user.id]);
  if (!updated.email_verified_at) throw new Error('email_verified_at not set');

  let failed = false;
  try {
    await verifyOtp(user.id, 'email', '000000');
  } catch (e) {
    failed = true;
  }
  if (!failed) throw new Error('Should reject wrong OTP after consume');

  const row = await queryOne(
    `SELECT * FROM verification_codes WHERE user_id = $1 AND channel = 'sms' ORDER BY id DESC LIMIT 1`,
    [user.id]
  );
  if (row) throw new Error('Unexpected SMS row');

  const smsCode = await issueOtp(user.id, 'sms');
  const expired = await query(
    `UPDATE verification_codes SET expires_at = NOW() - interval '1 minute'
     WHERE user_id = $1 AND channel = 'sms' AND consumed_at IS NULL`,
    [user.id]
  );
  let expiredFailed = false;
  try {
    await verifyOtp(user.id, 'sms', smsCode);
  } catch (e) {
    expiredFailed = e.message.includes('expired');
  }
  if (!expiredFailed) throw new Error('Should reject expired OTP');

  if (OTP_EXPIRY_MINUTES !== 10) throw new Error('OTP expiry default unexpected');

  await query('DELETE FROM users WHERE id = $1', [user.id]);
  console.log('Auth OTP unit test passed');
}

run().catch((error) => {
  console.error('FAILED:', error.message);
  process.exit(1);
});
