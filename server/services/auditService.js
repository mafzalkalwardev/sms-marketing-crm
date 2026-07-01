const { query } = require('../config/database');

async function logAudit({ actorUserId, targetUserId = null, action, details = {} }) {
  await query(
    `INSERT INTO audit_logs (actor_user_id, target_user_id, action, details)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [actorUserId, targetUserId, action, JSON.stringify(details)]
  );
}

module.exports = { logAudit };
