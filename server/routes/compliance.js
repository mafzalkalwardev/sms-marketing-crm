const express = require('express');
const { queryOne, queryAll } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const STOP_KEYWORDS = ['STOP', 'UNSUBSCRIBE', 'REMOVE', 'CANCEL', 'END', 'QUIT', 'NO', "DON'T TEXT ME", 'PLEASE REMOVE ME'];

function workspaceId(req) {
  return req.user.workspace_id || 1;
}

router.get('/summary', async (req, res, next) => {
  try {
    const ws = workspaceId(req);
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';

    const suppressionSql = isAdmin
      ? 'SELECT COUNT(*)::int AS n FROM suppression_list WHERE workspace_id = $1'
      : 'SELECT COUNT(*)::int AS n FROM suppression_list WHERE workspace_id = $1 AND (user_id = $2 OR user_id IS NULL)';
    const suppressionParams = isAdmin ? [ws] : [ws, userId];

    const [suppressed, unsubContacts, optedIn, stopEvents] = await Promise.all([
      queryOne(suppressionSql, suppressionParams),
      queryOne(
        'SELECT COUNT(*)::int AS n FROM contacts WHERE workspace_id = $1 AND is_unsubscribed = TRUE',
        [ws]
      ),
      queryOne(
        "SELECT COUNT(*)::int AS n FROM contacts WHERE workspace_id = $1 AND consent_status = 'opted_in' AND is_unsubscribed = FALSE",
        [ws]
      ),
      queryOne(
        `SELECT COUNT(*)::int AS n FROM messages
         WHERE workspace_id = $1 AND direction = 'inbound'
           AND UPPER(TRIM(message_body)) = ANY($2::text[])`,
        [ws, STOP_KEYWORDS]
      ),
    ]);

    res.json({
      stopKeywords: STOP_KEYWORDS,
      suppressedNumbers: suppressed?.n || 0,
      unsubscribedContacts: unsubContacts?.n || 0,
      optedInContacts: optedIn?.n || 0,
      inboundStopMessages: stopEvents?.n || 0,
      autoBlockEnabled: true,
      campaignExcludesSuppressed: true,
    });
  } catch (e) {
    next(e);
  }
});

router.get('/suppressions', async (req, res, next) => {
  try {
    const ws = workspaceId(req);
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    const limit = Math.min(Number(req.query.limit) || 100, 500);

    const rows = isAdmin
      ? await queryAll(
        `SELECT sl.id, sl.phone, sl.reason, sl.source, sl.created_at, u.name AS user_name
         FROM suppression_list sl
         LEFT JOIN users u ON u.id = sl.user_id
         WHERE sl.workspace_id = $1
         ORDER BY sl.created_at DESC
         LIMIT $2`,
        [ws, limit]
      )
      : await queryAll(
        `SELECT sl.id, sl.phone, sl.reason, sl.source, sl.created_at, u.name AS user_name
         FROM suppression_list sl
         LEFT JOIN users u ON u.id = sl.user_id
         WHERE sl.workspace_id = $1 AND (sl.user_id = $2 OR sl.user_id IS NULL)
         ORDER BY sl.created_at DESC
         LIMIT $3`,
        [ws, userId, limit]
      );

    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.get('/suppressions/export', async (req, res, next) => {
  try {
    const ws = workspaceId(req);
    const userId = req.user.id;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';

    const rows = isAdmin
      ? await queryAll(
        `SELECT phone, reason, source, created_at
         FROM suppression_list WHERE workspace_id = $1 ORDER BY created_at DESC`,
        [ws]
      )
      : await queryAll(
        `SELECT phone, reason, source, created_at
         FROM suppression_list WHERE workspace_id = $1 AND (user_id = $2 OR user_id IS NULL)
         ORDER BY created_at DESC`,
        [ws, userId]
      );

    const header = 'phone,reason,source,created_at\n';
    const body = rows.map((row) => {
      const escape = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
      return [escape(row.phone), escape(row.reason), escape(row.source), escape(row.created_at)].join(',');
    }).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="signalmint-suppressions.csv"');
    res.send(header + body);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
