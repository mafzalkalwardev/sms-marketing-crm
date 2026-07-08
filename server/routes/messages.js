const express = require('express');
const { queryOne } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { sanitizeMessage } = require('../lib/sanitize');
const messageStateService = require('../services/messageStateService');
const { toCustomerStatus } = require('../domain/states');
const { dataUserIdClause } = require('../lib/orgScope');

const router = express.Router();
router.use(authenticate);

async function messageForUser(messageId, actor) {
  let sql = 'SELECT * FROM messages WHERE id = $1';
  const params = [messageId];
  const scope = dataUserIdClause(actor, 'user_id', 2);
  sql += scope.clause;
  params.push(...scope.params);
  const message = await queryOne(sql, params);
  return message || null;
}

router.get('/:id', async (req, res, next) => {
  try {
    const message = await messageForUser(Number(req.params.id), req.user);
    if (!message) return res.status(404).json({ error: 'Message not found' });
    res.json(sanitizeMessage(message));
  } catch (e) {
    next(e);
  }
});

router.get('/:id/timeline', async (req, res, next) => {
  try {
    const message = await messageForUser(Number(req.params.id), req.user);
    if (!message) return res.status(404).json({ error: 'Message not found' });
    const timeline = await messageStateService.getStatusTimeline(message.id);
    res.json({
      messageId: message.id,
      currentStatus: toCustomerStatus(message.status),
      timeline: timeline.map((event) => ({
        from: event.from_status ? toCustomerStatus(event.from_status) : null,
        to: toCustomerStatus(event.to_status),
        source: event.source,
        at: event.created_at,
      })),
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
