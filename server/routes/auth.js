const express = require('express');
const bcrypt = require('bcryptjs');
const { query, queryOne } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { enrichUser, getOrgBranding, resolveTenancy } = require('../services/tenancyService');
const { dataUserIdClause, assertContactAccess } = require('../lib/orgScope');
const { createSession, revokeSession, revokeAllSessions, listSessions, logLogin } = require('../services/sessionService');
const { sendEmailOtp, sendSmsOtp, verifyOtp, advanceVerificationStatus } = require('../services/otpService');
const { normalizePhone, isValidPhone } = require('../lib/sms');

const router = express.Router();

function clientMeta(req) {
  return {
    ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress,
    userAgent: req.headers['user-agent'],
  };
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    email_verified: Boolean(user.email_verified_at),
    phone_verified: Boolean(user.phone_verified_at),
  };
}

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, phone, org_invite_code: orgInviteCode } = req.body;
    if (!name || !email || !password || !phone) {
      return res.status(400).json({ error: 'Name, email, phone, and password are required' });
    }
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const phoneNorm = normalizePhone(phone);
    if (!isValidPhone(phoneNorm)) return res.status(400).json({ error: 'Phone must be valid E.164 format' });

    let organizationId = null;
    let workspaceId = null;
    let managedByAdminId = null;

    if (orgInviteCode) {
      const invite = await queryOne(
        `SELECT * FROM org_invite_codes
         WHERE code = $1 AND (expires_at IS NULL OR expires_at > NOW())
         AND (max_uses IS NULL OR use_count < max_uses)`,
        [String(orgInviteCode).trim()]
      );
      if (!invite) return res.status(400).json({ error: 'Invalid or expired invite code' });
      organizationId = invite.organization_id;
      managedByAdminId = invite.admin_user_id;
      workspaceId = await queryOne(
        'SELECT id FROM workspaces WHERE organization_id = $1 ORDER BY id ASC LIMIT 1',
        [organizationId]
      ).then((r) => r?.id);
      await query('UPDATE org_invite_codes SET use_count = use_count + 1 WHERE id = $1', [invite.id]);
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await queryOne(
      `INSERT INTO users (name, email, password_hash, phone, role, status, organization_id, workspace_id, managed_by_admin_id)
       VALUES ($1, $2, $3, $4, 'user', 'pending_verification', $5, $6, $7) RETURNING *`,
      [
        name,
        email.toLowerCase(),
        hash,
        phoneNorm,
        organizationId,
        workspaceId,
        managedByAdminId,
      ]
    );
    await query(
      "INSERT INTO subscriptions (user_id, plan_name, status, starts_at) VALUES ($1, 'starter', 'pending', NOW())",
      [user.id]
    );

    await sendEmailOtp(user);
    await sendSmsOtp(user);

    res.status(201).json({
      ok: true,
      user: publicUser(user),
      nextStep: 'verify_email',
      message: 'Verification codes sent to your email and phone.',
    });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    next(e);
  }
});

router.post('/verify-email', async (req, res, next) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'Email and code are required' });
    const user = await queryOne('SELECT * FROM users WHERE email = $1', [String(email).toLowerCase()]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    await verifyOtp(user.id, 'email', code);
    const updated = await advanceVerificationStatus(user.id);
    res.json({
      ok: true,
      user: publicUser(updated),
      nextStep: updated.phone_verified_at ? (updated.status === 'pending_approval' ? 'pending_approval' : 'login') : 'verify_phone',
    });
  } catch (e) {
    next(e);
  }
});

router.post('/verify-phone', async (req, res, next) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'Email and code are required' });
    const user = await queryOne('SELECT * FROM users WHERE email = $1', [String(email).toLowerCase()]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    await verifyOtp(user.id, 'sms', code);
    const updated = await advanceVerificationStatus(user.id);
    res.json({
      ok: true,
      user: publicUser(updated),
      nextStep: updated.status === 'pending_approval' ? 'pending_approval' : 'login',
    });
  } catch (e) {
    next(e);
  }
});

router.post('/resend-otp', async (req, res, next) => {
  try {
    const { email, channel } = req.body;
    if (!email || !['email', 'sms'].includes(channel)) {
      return res.status(400).json({ error: 'Email and channel (email|sms) are required' });
    }
    const user = await queryOne('SELECT * FROM users WHERE email = $1', [String(email).toLowerCase()]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.status !== 'pending_verification') {
      return res.status(400).json({ error: 'Account is not awaiting verification' });
    }
    if (channel === 'email') await sendEmailOtp(user);
    else await sendSmsOtp(user);
    res.json({ ok: true, message: `New ${channel} code sent.` });
  } catch (e) {
    next(e);
  }
});

router.post('/login', async (req, res, next) => {
  const meta = clientMeta(req);
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    const user = await queryOne('SELECT * FROM users WHERE email = $1', [String(email).toLowerCase()]);
    if (!user || !await bcrypt.compare(password, user.password_hash)) {
      await logLogin({ email, success: false, ...meta, failureReason: 'invalid_credentials' });
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (user.status === 'pending_verification') {
      return res.status(403).json({ error: 'Please verify your email and phone before signing in.', code: 'pending_verification' });
    }
    if (user.status === 'pending_approval') {
      return res.status(403).json({ error: 'Your account is pending administrator approval.', code: 'pending_approval' });
    }
    if (user.status !== 'active') {
      await logLogin({ userId: user.id, email: user.email, success: false, ...meta, failureReason: user.status });
      return res.status(403).json({ error: 'Your account is temporarily unavailable. Contact support.' });
    }
    const enriched = await enrichUser(user);
    const { token } = await createSession(enriched, meta);
    await logLogin({ userId: user.id, email: user.email, success: true, ...meta });
    res.json({ token, user: publicUser(enriched) });
  } catch (e) {
    next(e);
  }
});

router.post('/logout', authenticate, async (req, res, next) => {
  try {
    if (req.tokenJti) await revokeSession(req.tokenJti);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get('/sessions', authenticate, async (req, res, next) => {
  try {
    const sessions = await listSessions(req.user.id);
    res.json({ sessions });
  } catch (e) {
    next(e);
  }
});

router.post('/sessions/revoke-all', authenticate, async (req, res, next) => {
  try {
    await revokeAllSessions(req.user.id);
    if (req.tokenJti) await revokeSession(req.tokenJti);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const branding = await getOrgBranding(req.user.organization_id);
    res.json({
      ...publicUser(req.user),
      organization_id: req.user.organization_id,
      workspace_id: req.user.workspace_id,
      subscription_plan: req.user.subscription_plan,
      impersonated_by: req.impersonatedBy || null,
      branding: {
        brandName: branding.brandName,
        primaryColor: branding.primaryColor,
      },
    });
  } catch (e) {
    next(e);
  }
});

router.put('/profile', authenticate, async (req, res, next) => {
  try {
    const { name, email } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });
    await query(
      'UPDATE users SET name = $1, email = $2, updated_at = NOW() WHERE id = $3',
      [name, email.toLowerCase(), req.user.id]
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/change-password', authenticate, async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) return res.status(400).json({ error: 'Current and new password are required' });
    if (String(new_password).length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
    const user = await queryOne('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!await bcrypt.compare(current_password, user.password_hash)) return res.status(400).json({ error: 'Current password is incorrect' });
    const hash = await bcrypt.hash(new_password, 10);
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, req.user.id]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
