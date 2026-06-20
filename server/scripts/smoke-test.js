const API = process.env.SMOKE_API_URL || 'http://localhost:5000';

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
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path} failed: ${response.status} ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  const stamp = Date.now();
  const email = `smoke-${stamp}@example.com`;
  const password = 'SmokeTest123!';
  const phone = `+1555${String(stamp).slice(-7)}`;
  const sender = `+1777${String(stamp).slice(-7)}`;

  await request('/api/health');
  const registered = await request('/api/auth/register', {
    method: 'POST',
    body: { name: 'Smoke Tester', email, password },
  });
  const loggedIn = await request('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  const token = loggedIn.token || registered.token;

  const me = await request('/api/auth/me', { token });
  if (me.email !== email) throw new Error('Auth /me returned the wrong user');

  const contact = await request('/api/contacts', {
    method: 'POST',
    token,
    body: { name: 'Smoke Contact', phone, country: 'US', consent_status: 'opted_in', consent_source: 'smoke' },
  });
  await request('/api/numbers', {
    method: 'POST',
    token,
    body: { phone_number: sender, country: 'US', type: 'long-code', is_default: true },
  });
  const sent = await request('/api/manual-sms/send', {
    method: 'POST',
    token,
    body: { to: phone, from: sender, message: 'Smoke test SMS. Reply STOP to opt out.' },
  });
  if (!sent.ok || sent.mode !== 'mock') throw new Error('Expected mock SMS send to pass');

  const conversations = await request('/api/inbox/conversations', { token });
  if (!Array.isArray(conversations) || conversations.length === 0) throw new Error('Expected at least one conversation');

  await request('/webhooks/vonage/inbound', {
    method: 'POST',
    body: { from: phone, to: sender, text: 'YES', messageId: `in_${stamp}` },
  });
  await request('/webhooks/vonage/status', {
    method: 'POST',
    body: { messageId: sent.messageId, status: 'delivered' },
  });
  await request('/webhooks/vonage/inbound', {
    method: 'POST',
    body: { from: phone, to: sender, text: 'STOP', messageId: `stop_${stamp}` },
  });
  const contacts = await request(`/api/contacts?search=${encodeURIComponent(phone)}`, { token });
  const stopped = contacts.find((row) => row.id === contact.id);
  if (!stopped || !stopped.is_unsubscribed) throw new Error('STOP webhook did not unsubscribe contact');

  const campaign = await request('/api/campaigns', {
    method: 'POST',
    token,
    body: { title: 'Smoke Campaign', message_template: 'Hi {{name}}, smoke test. Reply STOP to opt out.', send_rate: 1 },
  });
  await request(`/api/campaigns/${campaign.id}/preview`, { method: 'POST', token });
  await request('/api/reports/dashboard', { token });

  console.log(JSON.stringify({
    ok: true,
    api: API,
    user: email,
    contactId: contact.id,
    smsMode: sent.mode,
    smsStatus: sent.status,
    campaignId: campaign.id,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
