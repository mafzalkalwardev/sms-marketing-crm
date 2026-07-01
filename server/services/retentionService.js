const { query, queryAll } = require('../config/database');
const { logAudit } = require('./auditService');

async function purgeExpiredMessages() {
  if (process.env.MESSAGE_RETENTION_ENABLED === 'false') return { purged: 0 };

  const orgs = await queryAll(
    `SELECT id, name, message_retention_days, hipaa_mode
     FROM organizations
     WHERE message_retention_days IS NOT NULL AND message_retention_days > 0`
  );

  let totalPurged = 0;

  for (const org of orgs) {
    const days = org.message_retention_days;
    const result = await query(
      `DELETE FROM messages
       WHERE organization_id = $1
         AND created_at < NOW() - ($2 || ' days')::interval
       RETURNING id`,
      [org.id, String(days)]
    );
    const count = result.rowCount || 0;
    if (count > 0) {
      totalPurged += count;
      await logAudit({
        actorUserId: null,
        action: 'message_retention_purge',
        details: {
          organizationId: org.id,
          organizationName: org.name,
          purgedCount: count,
          retentionDays: days,
          hipaaMode: org.hipaa_mode,
        },
      });
    }
  }

  return { purged: totalPurged, organizations: orgs.length };
}

function startRetentionScheduler() {
  if (process.env.MESSAGE_RETENTION_ENABLED === 'false') return;

  const intervalMs = Number(process.env.MESSAGE_RETENTION_INTERVAL_MS) || 24 * 60 * 60 * 1000;

  const run = () => {
    purgeExpiredMessages().then((result) => {
      if (result.purged > 0) {
        console.log(`Message retention purge removed ${result.purged} message(s)`);
      }
    }).catch((error) => {
      console.error('Message retention purge failed:', error.message);
    });
  };

  run();
  setInterval(run, intervalMs);
  console.log(`Message retention scheduler started (${intervalMs}ms)`);
}

module.exports = { purgeExpiredMessages, startRetentionScheduler };
