require('dotenv').config({ quiet: true });

const API = process.env.SMOKE_API_URL || 'http://localhost:5000';
const WORKER = process.env.AUTOMATION_WORKER_URL || 'http://localhost:5055';

async function request(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.workerToken ? { Authorization: `Bearer ${options.workerToken}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Non-JSON ${response.status}: ${text.slice(0, 200)}`);
  }
  return { ok: response.ok, status: response.status, data };
}

async function main() {
  console.log('=== Browser Lane + API Integration Test ===\n');

  const workerHealth = await request(`${WORKER}/health`);
  if (!workerHealth.data.ok) throw new Error('Automation worker health failed');
  console.log(`Worker health OK (sandbox=${workerHealth.data.sandboxMode})`);

  const login = await request(`${API}/api/auth/login`, {
    method: 'POST',
    body: { email: 'super_admin@signalmint.local', password: 'password123' },
  });
  if (!login.data.token) throw new Error('Super admin login failed');
  const token = login.data.token;
  console.log('Super admin login OK');

  const catalog = await request(`${API}/api/super/providers/catalog`, { token });
  const apiDialers = catalog.data.catalog?.filter((e) => e.lane === 'api') || [];
  const browserDialers = catalog.data.catalog?.filter((e) => e.lane === 'browser') || [];
  console.log(`Catalog: ${apiDialers.length} API dialers, ${browserDialers.length} browser dialers`);

  const stamp = Date.now();
  const gv = await request(`${API}/api/super/providers`, {
    method: 'POST',
    token,
    body: {
      provider: 'google_voice',
      label: `GV Lane ${stamp}`,
      base_url: 'https://voice.google.com',
      api_key: `profile_${stamp}`,
      api_secret: 'browser-profile',
      warmup_to: '+15559876543',
      send_warmup: true,
    },
  });
  if (!gv.data.browserProfile?.id) throw new Error('Google Voice provider did not create browser profile');
  console.log(`Google Voice profile #${gv.data.browserProfile.id} created`);

  const browserTest = await request(`${API}/api/super/browser-profiles/${gv.data.browserProfile.id}/test-send`, {
    method: 'POST',
    token,
    body: { to: '+15559876543', message: 'DOM/BOM lane test' },
  });
  if (!browserTest.data.ok) throw new Error(`Browser test-send failed: ${browserTest.data.error}`);
  console.log(`Browser test-send OK (${browserTest.data.mode}, ${browserTest.data.status})`);

  const loginSession = await request(`${API}/api/super/browser-profiles/${gv.data.browserProfile.id}/login`, {
    method: 'POST',
    token,
  });
  if (!loginSession.data.ok) throw new Error('Browser login session failed');
  console.log(`Browser login session: ${loginSession.data.sessionStatus}`);

  const poll = await request(`${API}/api/super/browser-profiles/${gv.data.browserProfile.id}/poll`, {
    method: 'POST',
    token,
  });
  if (!poll.data.ok) throw new Error('Browser inbound poll failed');
  console.log('Browser inbound poll OK');

  const internal = await request(`${API}/internal/worker/health`, {
    workerToken: process.env.WORKER_SERVICE_TOKEN || 'dev_worker_token_change_me',
  });
  if (!internal.data.ok) throw new Error('Internal worker bridge failed');
  console.log('Internal worker API bridge OK');

  const telnyxWebhook = await request(`${API}/webhooks/telnyx/inbound`, {
    method: 'POST',
    body: { from: '+15551112222', to: '+15553334444', text: 'API lane probe', id: `api_${stamp}` },
  });
  if (telnyxWebhook.status !== 200) throw new Error('API webhook route failed');
  console.log('API webhook lane OK');

  console.log('\n=== BROWSER + API LANES READY ===');
  process.exit(0);
}

main().catch((error) => {
  console.error('BROWSER LANE TEST FAILED:', error.message);
  process.exit(1);
});
