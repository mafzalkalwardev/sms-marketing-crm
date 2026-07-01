require('dotenv').config();
const { initDatabase, query, queryOne } = require('../config/database');
const { sendTextMessage } = require('../services/smsService');

const COUNT = Number(process.env.LOAD_TEST_COUNT || process.argv[2] || 100);
const CONCURRENCY = Math.max(1, Number(process.env.LOAD_TEST_CONCURRENCY || 5));
const DAILY_TARGET = Number(process.env.LOAD_TEST_DAILY_TARGET || 10000);
const stamp = Date.now();
const suffix = String(stamp).slice(-7);

const stats = {
  attempted: 0,
  ok: 0,
  failed: 0,
  idempotencyChecks: 0,
  idempotencyPassed: 0,
  errors: [],
};

async function setupUser() {
  const user = await query(
    `INSERT INTO users (name, email, password_hash, role, status, message_limit_monthly, organization_id)
     VALUES ($1, $2, 'load-test', 'user', 'active', $3, 1)
     RETURNING *`,
    ['Load Test User', `load-test-${stamp}@example.com`, COUNT + 500]
  ).then((r) => r.rows[0]);

  const from = `+1888${suffix}`;
  await query(
    `INSERT INTO numbers (user_id, phone_number, country, type, label, provider, status, is_default)
     VALUES ($1, $2, 'US', 'long-code', 'Load line', 'mock', 'active', TRUE)`,
    [user.id, from]
  );

  const recipients = [];
  for (let i = 0; i < Math.min(50, COUNT); i += 1) {
    const phone = `+1999${String(1000000 + i).slice(-7)}`;
    await query(
      `INSERT INTO contacts (user_id, workspace_id, organization_id, name, phone, country, consent_status, is_unsubscribed)
       VALUES ($1, 1, 1, $2, $3, 'US', 'opted_in', FALSE)`,
      [user.id, `Load Contact ${i}`, phone]
    );
    recipients.push(phone);
  }

  return { user, from, recipients };
}

async function sendOne(user, from, to, index) {
  const idempotencyKey = `load_${stamp}_${index}`;
  stats.attempted += 1;

  try {
    const first = await sendTextMessage({
      user,
      to,
      from,
      message: `Load test message #${index}`,
      workspaceId: 1,
      idempotencyKey,
    });

    if (!first.ok) {
      stats.failed += 1;
      if (stats.errors.length < 5) stats.errors.push(`#${index}: ${first.error || 'not ok'}`);
      return;
    }

    stats.ok += 1;

    if (index % 10 === 0) {
      stats.idempotencyChecks += 1;
      const second = await sendTextMessage({
        user,
        to,
        from,
        message: `Load test message #${index}`,
        workspaceId: 1,
        idempotencyKey,
      });
      if (second.mode === 'idempotent' && second.message?.id === first.message?.id) {
        stats.idempotencyPassed += 1;
      } else if (stats.errors.length < 5) {
        stats.errors.push(`Idempotency miss at #${index}`);
      }
    }
  } catch (error) {
    stats.failed += 1;
    if (stats.errors.length < 5) stats.errors.push(`#${index}: ${error.message}`);
  }
}

async function runPool(user, from, recipients) {
  let cursor = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= COUNT) break;
      const to = recipients[index % recipients.length];
      await sendOne(user, from, to, index);
    }
  });
  await Promise.all(workers);
}

async function verifyNoDuplicateKeys() {
  const row = await queryOne(
    `SELECT idempotency_key, COUNT(*)::int AS n
     FROM messages
     WHERE idempotency_key LIKE $1
     GROUP BY idempotency_key
     HAVING COUNT(*) > 1
     LIMIT 1`,
    [`load_${stamp}_%`]
  );
  if (row) {
    throw new Error(`Duplicate DB rows for idempotency key ${row.idempotency_key}`);
  }
}

async function verifyLimitEnforcement(user, from, to) {
  const used = await queryOne(
    `SELECT COUNT(*)::int AS n FROM messages WHERE user_id = $1 AND direction = 'outbound'`,
    [user.id]
  );
  await query('UPDATE users SET message_limit_monthly = $1 WHERE id = $2', [used.n, user.id]);
  const refreshed = await queryOne('SELECT * FROM users WHERE id = $1', [user.id]);

  let blocked = false;
  try {
    await sendTextMessage({
      user: refreshed,
      to,
      from,
      message: 'Should be blocked by limit',
      workspaceId: 1,
    });
  } catch (error) {
    if (error.status === 403 && String(error.message).includes('limit')) blocked = true;
    else throw error;
  }

  if (!blocked) throw new Error('Monthly limit was not enforced');
}

async function run() {
  console.log('=== SignalMint Load Test ===\n');
  console.log(`Messages: ${COUNT} · Concurrency: ${CONCURRENCY} · Daily target: ${DAILY_TARGET}\n`);

  await initDatabase();
  const { user, from, recipients } = await setupUser();

  const start = Date.now();
  await runPool(user, from, recipients);
  const elapsedMs = Date.now() - start;
  const elapsedSec = elapsedMs / 1000;
  const perSecond = stats.ok / elapsedSec;
  const projectedDaily = Math.round(perSecond * 86400);

  await verifyNoDuplicateKeys();
  await verifyLimitEnforcement(user, from, recipients[0]);

  const successRate = stats.attempted ? (stats.ok / stats.attempted) * 100 : 0;

  console.log('Results');
  console.log(`  OK:              ${stats.ok}/${stats.attempted} (${successRate.toFixed(1)}%)`);
  console.log(`  Failed:          ${stats.failed}`);
  console.log(`  Elapsed:         ${elapsedSec.toFixed(2)}s`);
  console.log(`  Throughput:      ${perSecond.toFixed(1)} msg/s`);
  console.log(`  Projected/day:   ${projectedDaily.toLocaleString()} msgs`);
  console.log(`  Idempotency:     ${stats.idempotencyPassed}/${stats.idempotencyChecks} passed`);
  console.log('  Limit enforced:  yes');
  console.log('  DB duplicates:   none\n');

  if (successRate < 99) {
    throw new Error(`Success rate below 99%: ${successRate.toFixed(1)}%`);
  }
  if (stats.idempotencyChecks > 0 && stats.idempotencyPassed !== stats.idempotencyChecks) {
    throw new Error('Idempotency checks failed');
  }
  if (projectedDaily < DAILY_TARGET) {
    throw new Error(`Projected daily throughput ${projectedDaily} below target ${DAILY_TARGET}`);
  }
  if (stats.errors.length) {
    console.log('Sample errors:', stats.errors);
  }

  console.log(`=== LOAD TEST PASSED (≥${DAILY_TARGET.toLocaleString()} msgs/day capacity) ===`);
}

run().catch((error) => {
  console.error('LOAD TEST FAILED:', error.message);
  process.exit(1);
});
