process.env.SMS_SANDBOX_MODE = 'true';

const { ADAPTERS } = require('../services/providers/providerRegistry');

const fixtures = {
  vonage: { apiKey: 'k', apiSecret: 's' },
  twilio: { accountSid: 'AC123', authToken: 'token' },
  telnyx: { apiKey: 'k' },
  bandwidth: { apiKey: 'u', apiSecret: 'p', accountId: '1', applicationId: 'app' },
  zoom: { apiKey: 'cid', apiSecret: 'sec', accountId: 'acc' },
  ringox: { apiKey: 'k', baseUrl: 'https://ringox.test' },
  '3cx': { apiKey: 'k', baseUrl: 'https://3cx.test' },
  google_voice: { baseUrl: 'https://voice.google.com' },
  advertiser: { baseUrl: 'https://dialer.test' },
};

async function main() {
  console.log('=== Dialer adapter unit tests (sandbox) ===\n');
  let failed = 0;

  for (const [id, credentials] of Object.entries(fixtures)) {
    const adapter = ADAPTERS[id];
    if (!adapter) {
      console.log(`${id.padEnd(14)} MISSING ADAPTER`);
      failed += 1;
      continue;
    }
    const configured = adapter.isConfigured?.(credentials);
    const connection = await adapter.testConnection?.(credentials);
    const send = await adapter.sendSms?.({
      to: '+15551234567',
      from: '+15559876543',
      text: 'unit test',
      credentials,
      profileId: 1,
    });
    const ok = configured && connection?.ok && send?.ok;
    console.log(
      `${id.padEnd(14)} configured=${configured} connection=${connection?.ok} send=${send?.ok} mode=${send?.mode || send?.provider}`
    );
    if (!ok) failed += 1;
  }

  if (failed) {
    console.error(`\n${failed} adapter(s) failed`);
    process.exit(1);
  }
  console.log('\nAll adapters ready in sandbox mode.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
