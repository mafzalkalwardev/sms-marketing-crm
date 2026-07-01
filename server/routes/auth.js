const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, queryOne } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { enrichUser, getOrgBranding } = require('../services/tenancyService');

const router = express.Router();

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are required' });
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const hash = await bcrypt.hash(password, 10);
    const user = await queryOne(
      "INSERT INTO users (name, email, password_hash, role, organization_id, workspace_id) VALUES ($1, $2, $3, 'user', 1, 1) RETURNING *",
      [name, email.toLowerCase(), hash]
    );
    await query(
      "INSERT INTO subscriptions (user_id, plan_name, status, starts_at) VALUES ($1, 'starter', 'active', NOW())",
      [user.id]
    );
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      user: { id: user.id, name, email: email.toLowerCase(), role: 'user', status: 'active' },
    });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    next(e);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    const user = await queryOne('SELECT * FROM users WHERE email = $1', [String(email).toLowerCase()]);
    if (!user || !await bcrypt.compare(password, user.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Your account is temporarily unavailable. Contact support.' });
    }
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status },
    });
  } catch (e) {
    next(e);
  }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const branding = await getOrgBranding(req.user.organization_id);
    res.json({
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      status: req.user.status,
      organization_id: req.user.organization_id,
      workspace_id: req.user.workspace_id,
      subscription_plan: req.user.subscription_plan,
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
