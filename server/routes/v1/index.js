const express = require('express');
const { queryAll } = require('../../config/database');
const { authenticateApiKeyOrJwt, requireScope } = require('../../middleware/apiKeyAuth');
const { sendTextMessage } = require('../../services/smsService');

const router = express.Router();
router.use(authenticateApiKeyOrJwt);

router.get('/contacts', requireScope('contacts:read'), async (req, res, next) => {
  try {
    const ws = req.user.workspace_id || 1;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    const sql = isAdmin
      ? `SELECT id, name, phone, country, email, consent_status, is_unsubscribed, created_at
         FROM contacts WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 200`
      : `SELECT id, name, phone, country, email, consent_status, is_unsubscribed, created_at
         FROM contacts WHERE workspace_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 200`;
    const rows = isAdmin
      ? await queryAll(sql, [ws])
      : await queryAll(sql, [ws, req.user.id]);
    res.json({ contacts: rows });
  } catch (e) {
    next(e);
  }
});

router.post('/messages/send', requireScope('messages:send'), async (req, res, next) => {
  try {
    const { to, from, message, contact_name: contactName } = req.body;
    if (!to || !message) return res.status(400).json({ error: 'to and message are required' });

    const result = await sendTextMessage({
      user: req.user,
      to,
      from,
      message,
      contactName: contactName || to,
      workspaceId: req.user.workspace_id || 1,
      organizationId: req.user.organization_id || 1,
    });

    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      mode: result.mode,
      messageId: result.message?.id,
      status: result.message?.status,
      error: result.error,
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
