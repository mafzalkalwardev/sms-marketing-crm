require('dotenv').config({ quiet: true });

const API = process.env.SMOKE_API_URL || 'http://localhost:5000';
const WARMUP_TO = process.env.DIALER_TEST_TO || '+15559876543';

const DIALER_FIXTURES = [
  {
    id: 'vonage',
    body: { provider: 'vonage', label: 'Test Vonage', api_key: 'vonage_key_test', api_secret: 'vonage_secret_test' },
  },
  {
    id: 'twilio',
    body: {
      provider: 'twilio',
      label: 'Test Twilio',
      account_sid: 'ACtest123456789',
      api_key: 'twilio_token_test',
      api_secret: 'twilio_token_test',
    },
  },
  {
    id: 'telnyx',
    body: { provider: 'telnyx', label: 'Test Telnyx', api_key: 'telnyx_key_test', api_secret: 'unused' },
  },
  {
    id: 'bandwidth',
    body: {
      provider: 'bandwidth',
      label: 'Test Bandwidth',
      api_key: 'bw_user_test',
      api_secret: 'bw_pass_test',
      account_id: '5000001',
      application_id: 'app-test-123',
    },
  },
  {
    id: 'zoom',
    body: {
      provider: 'zoom',
      label: 'Test Zoom',
      api_key: 'zoom_client_id',
      api_secret: 'zoom_client_secret',
      account_id: 'zoom_account_123',
    },
  },
  {
    id: 'ringox',
    body: {
      provider: 'ringox',
      label: 'Test RingoX',
      api_key: 'ringox_token',
      api_secret: 'ringox_token',
      base_url: 'https://api.ringox.example.test',
    },
  },
  {
    id: '3cx',
    body: {
      provider: '3cx',
      label: 'Test 3CX',
      api_key: '3cx_token',
      api_secret: '3cx_token',
      base_url: 'https://pbx.example.test/3cx',
    },
  },
  {
    id: 'google_voice',
    body: {
      provider: 'google_voice',
      label: 'Test Google Voice',
      base_url: 'https://voice.google.com',
      api_key: 'profile-google-voice',
      api_secret: 'browser-profile',
    },
  },
  {
    id: 'advertiser',
    body: {
      provider: 'advertiser',
      label: 'Test Advertiser Dialer',
      base_url: 'https://dialer.advertiser.example.test',
      api_key: 'profile-advertiser',
      api_secret: 'browser-profile',
    },
  },
];

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${options.method || 'GET'} ${path} returned non-JSON ${response.status}: ${text.slice(0, 300)}`);
  }
  return { status: response.status, ok: response.ok, data };
}

async function main() {
  console.log('=== SignalMint All-Dialer Test ===\n');

  const login = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'super_admin@signalmint.local', password: 'password123' },
  });
  if (!login.data.token) throw new Error('Super admin login failed — run seed first');
  const token = login.data.token;
  console.log('Super admin login OK\n');

  const catalog = await request('/api/super/providers/catalog', { token });
  const catalogIds = catalog.data.catalog?.map((entry) => entry.id) || [];
  console.log(`Catalog dialers: ${catalogIds.join(', ')}\n`);

  const results = [];

  for (const fixture of DIALER_FIXTURES) {
    const stamp = Date.now();
    const body = {
      ...fixture.body,
      label: `${fixture.body.label} ${stamp}`,
      warmup_to: WARMUP_TO,
      send_warmup: true,
    };

    process.stdout.write(`${fixture.id.padEnd(14)} `);

    try {
      const added = await request('/api/super/providers', {
        method: 'POST',
        token,
        body,
      });
      if (!added.ok) {
        results.push({ id: fixture.id, ok: false, step: 'add', error: JSON.stringify(added.data) });
        console.log(`FAIL add ${added.status}`);
        continue;
      }

      const providerId = added.data.id;
      const connection = await request(`/api/super/providers/${providerId}/test`, {
        method: 'POST',
        token,
      });
      if (!connection.data.ok) {
        results.push({ id: fixture.id, ok: false, step: 'connection', error: connection.data.error });
        console.log(`FAIL connection — ${connection.data.error}`);
        continue;
      }

      const warmup = await request(`/api/super/providers/${providerId}/warmup`, {
        method: 'POST',
        token,
        body: { to: WARMUP_TO, message: `Dialer test ${fixture.id}` },
      });
      if (!warmup.data.ok) {
        results.push({ id: fixture.id, ok: false, step: 'warmup', error: warmup.data.warmup?.error || warmup.data.error });
        console.log(`FAIL warmup — ${warmup.data.warmup?.error || warmup.data.error}`);
        continue;
      }

      results.push({
        id: fixture.id,
        ok: true,
        mode: connection.data.mode,
        warmupStatus: warmup.data.warmup?.status,
      });
      console.log(`OK (${connection.data.mode || 'ok'}, warmup ${warmup.data.warmup?.status || 'sent'})`);
    } catch (error) {
      results.push({ id: fixture.id, ok: false, step: 'exception', error: error.message });
      console.log(`FAIL ${error.message}`);
    }
  }

  console.log('\n--- Webhook route smoke ---');
  const webhookProviders = ['telnyx', 'bandwidth', 'zoom', 'ringox', '3cx', 'mock'];
  for (const provider of webhookProviders) {
    const inbound = await request(`/webhooks/${provider}/inbound`, {
      method: 'POST',
      body: { from: '+15551110001', to: '+15552220001', text: 'webhook probe', id: `probe_${provider}` },
    });
    const status = inbound.status === 200 ? 'OK' : `HTTP ${inbound.status}`;
    console.log(`${provider.padEnd(14)} inbound ${status}`);
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  console.log(`\n=== RESULT: ${passed}/${results.length} dialers passed ===`);
  if (failed.length) {
    failed.forEach((row) => console.log(`  ✗ ${row.id} @ ${row.step}: ${row.error}`));
    process.exit(1);
  }

  if (catalogIds.length < DIALER_FIXTURES.length) {
    console.warn(`Warning: catalog has ${catalogIds.length} entries, expected ${DIALER_FIXTURES.length}`);
  }

  console.log('\nAll dialer adapters ready.');
  process.exit(0);
}

main().catch((error) => {
  console.error('DIALER TEST FAILED:', error.message);
  process.exit(1);
});
