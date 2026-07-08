require('dotenv').config({ quiet: true });

process.env.OTP_LOG_TO_CONSOLE = 'true';
process.env.REQUIRE_ADMIN_APPROVAL = 'true';

const API = process.env.SMOKE_API_URL || 'http://localhost:5000';

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { ok: response.ok, status: response.status, data, text };
}

async function run() {
  const stamp = Date.now();
  const email = `gov-test-${stamp}@example.com`;
  const phone = '+1555099' + String(stamp).slice(-4);

  const reg = await request('/api/auth/register', {
    method: 'POST',
    body: { name: 'Gov Test', email, password: 'password123', phone },
  });
  if (!reg.ok || reg.data.nextStep !== 'verify_email') {
    throw new Error(`Register failed: ${reg.status} ${reg.text}`);
  }

  const { query, queryOne, initDatabase } = require('../config/database');
  await initDatabase();

  const otpEmail = await queryOne(
    `SELECT vc.* FROM verification_codes vc
     JOIN users u ON u.id = vc.user_id
     WHERE u.email = $1 AND vc.channel = 'email' AND vc.consumed_at IS NULL
     ORDER BY vc.created_at DESC LIMIT 1`,
    [email]
  );
  if (!otpEmail) throw new Error('Email OTP not created');

  const bcrypt = require('bcryptjs');
  let emailCode = null;
  for (let i = 100000; i < 1000000; i += 1) {
    if (await bcrypt.compare(String(i), otpEmail.code_hash)) {
      emailCode = String(i);
      break;
    }
  }
  if (!emailCode) throw new Error('Could not derive email OTP');

  const verifyEmail = await request('/api/auth/verify-email', {
    method: 'POST',
    body: { email, code: emailCode },
  });
  if (!verifyEmail.ok) throw new Error('Email verify failed');

  const otpSms = await queryOne(
    `SELECT vc.* FROM verification_codes vc
     JOIN users u ON u.id = vc.user_id
     WHERE u.email = $1 AND vc.channel = 'sms' AND vc.consumed_at IS NULL
     ORDER BY vc.created_at DESC LIMIT 1`,
    [email]
  );
  let smsCode = null;
  for (let i = 100000; i < 1000000; i += 1) {
    if (await bcrypt.compare(String(i), otpSms.code_hash)) {
      smsCode = String(i);
      break;
    }
  }
  if (!smsCode) throw new Error('Could not derive SMS OTP');

  const verifyPhone = await request('/api/auth/verify-phone', {
    method: 'POST',
    body: { email, code: smsCode },
  });
  if (!verifyPhone.ok || verifyPhone.data.nextStep !== 'pending_approval') {
    throw new Error('Phone verify or approval step failed');
  }

  const blockedLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email, password: 'password123' },
  });
  if (blockedLogin.ok) throw new Error('Login should fail before approval');

  const superLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'super_admin@signalmint.local', password: 'password123' },
  });
  if (!superLogin.data.token) throw new Error('Super admin login failed');

  const pendingUser = await queryOne('SELECT id FROM users WHERE email = $1', [email]);
  const approve = await request(`/api/super/users/${pendingUser.id}/approve`, {
    method: 'POST',
    token: superLogin.data.token,
    body: { organization_id: 1, managed_by_admin_id: null },
  });
  if (!approve.ok) throw new Error('Super admin approve failed');

  const userLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email, password: 'password123' },
  });
  if (!userLogin.data.token) throw new Error('User login after approval failed');

  const impersonate = await request(`/api/super/users/${pendingUser.id}/impersonate`, {
    method: 'POST',
    token: superLogin.data.token,
  });
  if (!impersonate.data.token || !impersonate.data.impersonated_by) {
    throw new Error('Impersonation failed');
  }

  console.log('Governance test passed (OTP signup, approval, impersonation)');
}

run().catch((error) => {
  console.error('FAILED:', error.message);
  process.exit(1);
});
