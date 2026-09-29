/**
 * eSIM lane integration test (no Android device required).
 * Simulates: create profile → pairing code → agent pair → enqueue send → claim job → inbound.
 */
require('dotenv').config({ quiet: true });

const { initDatabase, query, queryOne } = require('../config/database');
const esimService = require('../services/esimService');
const esimProvider = require('../services/providers/esimProvider');
const providerRouter = require('../services/providers/providerRouter');
const { processInboundWebhook } = require('../services/inboundProcessor');
const { bootstrapProvidersFromEnv } = require('../services/providerBootstrap');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function ensureTestUser() {
  let user = await queryOne("SELECT * FROM users WHERE email = 'esim-test@signalmint.local' LIMIT 1");
  if (user) return user;

  const org = await queryOne('SELECT id FROM organizations ORDER BY id ASC LIMIT 1');
  const orgId = org?.id || 1;
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash('password123', 10);
  user = await queryOne(
    `INSERT INTO users (name, email, password_hash, role, status, organization_id, phone)
     VALUES ('eSIM Test', 'esim-test@signalmint.local', $1, 'user', 'active', $2, '+15550001111')
     RETURNING *`,
    [hash, orgId]
  );
  return user;
}

async function main() {
  console.log('=== eSIM lane test ===\n');
  await initDatabase();
  await bootstrapProvidersFromEnv();

  const user = await ensureTestUser();
  const stamp = Date.now();
  const phone = `+1555${String(stamp).slice(-7)}`;
  const lpa = `LPA:1\$smdp.test.example\$${stamp}-ACTIVATION`;

  // Clean prior test profiles for this user with same pattern not needed — unique phone each run
  const profile = await esimService.createProfile(user, {
    phoneNumber: phone,
    lpa,
    label: 'Test eSIM',
  });
  assert(profile.status === 'pending_install', 'Expected pending_install status');
  assert(profile.phoneNumber === phone, 'Phone mismatch');
  console.log('Created eSIM profile', profile.id, phone);

  const number = await queryOne(
    "SELECT * FROM numbers WHERE phone_number = $1 AND user_id = $2 AND provider = 'esim'",
    [phone, user.id]
  );
  assert(number, 'Expected numbers row with provider=esim');
  assert(number.is_default === true, 'eSIM number should be default');
  console.log('Linked numbers row', number.id);

  const pairing = await esimService.mintPairingCode(user.id, profile.id);
  assert(pairing.pairingCode && pairing.pairingCode.length === 6, 'Expected 6-digit pairing code');
  console.log('Pairing code minted', pairing.pairingCode);

  const paired = await esimService.pairAgent({
    pairingCode: pairing.pairingCode,
    deviceId: `test-device-${stamp}`,
  });
  assert(paired.token, 'Expected agent token');
  assert(paired.profile.status === 'paired', 'Expected paired status');
  console.log('Agent paired');

  const authProfile = await esimService.authenticateAgent(paired.token);
  assert(authProfile?.id === profile.id, 'Agent auth failed');

  const resolved = await providerRouter.resolveForNumber(phone);
  assert(resolved.providerKey === 'esim', `Expected esim provider, got ${resolved.providerKey}`);
  assert(resolved.esimPaired === true, 'Expected esimPaired=true');
  assert(resolved.adapterType === 'esim', 'Expected adapterType=esim');

  const { shouldUseMockSend } = require('../services/providers/sandbox');
  assert(
    shouldUseMockSend(resolved, { organizationDeliveryMode: 'sandbox', userStatus: 'active' }) === false,
    'Paired eSIM should bypass sandbox mock'
  );
  console.log('Router resolves paired eSIM without mock');

  const sendResult = await esimProvider.sendSms({
    to: '+15551239999',
    from: phone,
    text: 'eSIM test outbound',
    messageId: null,
  });
  assert(sendResult.ok && sendResult.mode === 'esim', 'Expected live esim enqueue');
  assert(sendResult.jobId, 'Expected job id');
  console.log('Outbound job enqueued', sendResult.jobId);

  const jobs = await esimService.claimJobs(authProfile, { limit: 5 });
  assert(jobs.length >= 1, 'Expected at least one claimed job');
  assert(jobs[0].text === 'eSIM test outbound', 'Job body mismatch');
  console.log('Agent claimed job', jobs[0].id);

  await esimService.completeJob(authProfile, jobs[0].id, { status: 'sent' });
  const jobRow = await queryOne('SELECT status FROM esim_outbound_jobs WHERE id = $1', [jobs[0].id]);
  assert(jobRow.status === 'sent', 'Job should be sent');
  console.log('Job marked sent');

  const inbound = await processInboundWebhook('esim', {
    from: '+15551239999',
    to: phone,
    text: 'hello from personal phone',
    providerMessageId: `esim_test_in_${stamp}`,
  }, { verified: true });
  assert(inbound.status === 200, `Inbound failed: ${JSON.stringify(inbound)}`);
  assert(inbound.body?.ok, 'Inbound body not ok');
  console.log('Inbound processed', inbound.body.messageId);

  const catalog = require('../services/providers/providerCatalog').getCatalogEntry('esim');
  assert(catalog?.lane === 'esim', 'Catalog missing esim');

  console.log('\nAll eSIM lane checks passed.');
  process.exit(0);
}

main().catch((error) => {
  console.error('\nFAILED:', error.message);
  console.error(error.stack);
  process.exit(1);
});
