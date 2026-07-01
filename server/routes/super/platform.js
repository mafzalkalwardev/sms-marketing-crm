const express = require('express');
const { queryOne, queryAll } = require('../../config/database');
const { logAudit } = require('../../services/auditService');
const { getProviderStatus } = require('../../services/smsService');
const { getLiveReadiness } = require('../../services/liveReadinessService');
const { listDeadLetters, retryDeadLetter } = require('../../services/webhookDeadLetterService');

const router = express.Router();

router.get('/webhook-logs', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const provider = req.query.provider || null;
    const rows = provider
      ? await queryAll(
        `SELECT id, user_id, provider, event_type, message_id, verified, created_at, payload
         FROM webhook_logs WHERE provider = $1 ORDER BY created_at DESC LIMIT $2`,
        [provider, limit]
      )
      : await queryAll(
        `SELECT id, user_id, provider, event_type, message_id, verified, created_at, payload
         FROM webhook_logs ORDER BY created_at DESC LIMIT $1`,
        [limit]
      );
    res.json({ logs: rows });
  } catch (e) {
    next(e);
  }
});

router.get('/audit', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const rows = await queryAll(
      `SELECT id, actor_user_id, target_user_id, action, details, created_at
       FROM audit_logs ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    res.json({ audit: rows });
  } catch (e) {
    next(e);
  }
});

router.get('/health/detail', async (req, res, next) => {
  try {
    let database = false;
    let providerCount = 0;
    let messageCount = 0;
    try {
      await queryOne('SELECT 1 AS ok');
      database = true;
      const providers = await queryOne('SELECT COUNT(*)::int AS count FROM providers');
      const messages = await queryOne('SELECT COUNT(*)::int AS count FROM messages');
      providerCount = providers?.count || 0;
      messageCount = messages?.count || 0;
    } catch {
      database = false;
    }

    const workerUrl = process.env.AUTOMATION_WORKER_URL || '';
    const automationWorker = { configured: Boolean(workerUrl), ok: null };
    if (workerUrl) {
      try {
        const response = await fetch(`${workerUrl.replace(/\/$/, '')}/health`, {
          headers: { Authorization: `Bearer ${process.env.WORKER_SERVICE_TOKEN || ''}` },
          signal: AbortSignal.timeout(3000),
        });
        automationWorker.ok = response.ok;
      } catch {
        automationWorker.ok = false;
      }
    }

    res.json({
      ok: database,
      version: '3.2.0',
      service: 'signalmint-api',
      database,
      providers: providerCount,
      messages: messageCount,
      platform: getProviderStatus(),
      liveReadiness: getLiveReadiness(),
      automationWorker,
    });
  } catch (e) {
    next(e);
  }
});

router.get('/webhook-dead-letters', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const provider = req.query.provider || null;
    const deadLetters = await listDeadLetters({ limit, provider });
    res.json({ deadLetters });
  } catch (e) {
    next(e);
  }
});

router.post('/webhook-dead-letters/:id/retry', async (req, res, next) => {
  try {
    const result = await retryDeadLetter(Number(req.params.id));
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.post('/audit/test', async (req, res) => {
  await logAudit({
    actorUserId: req.user.id,
    action: 'super_admin_test',
    details: { note: req.body.note || 'manual audit entry' },
  });
  res.json({ ok: true });
});

module.exports = router;
