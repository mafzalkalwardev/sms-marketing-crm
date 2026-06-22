require('dotenv').config({ quiet: true });
const jwt = require('jsonwebtoken');

const API = process.env.SMOKE_API_URL || 'http://localhost:5000';

function webhookHeaders() {
  if (!process.env.VONAGE_SIGNATURE_SECRET) return {};
  return {
    Authorization: `Bearer ${jwt.sign({ iss: 'signalmint-smoke-test', iat: Math.floor(Date.now() / 1000) }, process.env.VONAGE_SIGNATURE_SECRET, { algorithm: 'HS256' })}`,
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {}),
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
  const adminEmail = 'admin@ftsolutions.local';
  const adminPassword = 'password123';
  const user1Email = `user1-${stamp}@demo.local`;
  const user1Password = 'password123';
  const user2Email = `user2-${stamp}@demo.local`;
  const user2Password = 'password123';
  const phone1 = `+1555${String(stamp).slice(-7)}`;
  const phone2 = `+1555${String(stamp + 1000).slice(-7)}`;
  const sender1 = `+1777${String(stamp).slice(-7)}`;
  const sender2 = `+1777${String(stamp + 1000).slice(-7)}`;

  console.log('=== SignalMint Backend Smoke Test ===\n');

  const health = await request('/api/health');
  if (health.providerMode === 'live' && process.env.SMOKE_ALLOW_LIVE !== 'true') {
    throw new Error('Smoke test refuses to run against live SMS mode. Set VONAGE_MOCK_MODE=true or SMOKE_ALLOW_LIVE=true intentionally.');
  }
  console.log('Health check passed');

  const adminLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: adminEmail, password: adminPassword },
  });
  if (!adminLogin.token) throw new Error('Admin login failed');
  const adminToken = adminLogin.token;
  console.log('Admin login passed');

  const adminMe = await request('/api/auth/me', { token: adminToken });
  if (adminMe.role !== 'admin') throw new Error('Expected admin role');
  console.log('Admin /auth/me passed');

  const user1Reg = await request('/api/auth/register', {
    method: 'POST',
    body: { name: 'Demo User 1', email: user1Email, password: user1Password },
  });
  const user1Token = user1Reg.token;
  console.log('User1 registration passed');

  const user2Reg = await request('/api/auth/register', {
    method: 'POST',
    body: { name: 'Demo User 2', email: user2Email, password: user2Password },
  });
  const user2Token = user2Reg.token;
  console.log('User2 registration passed');

  const u1Me = await request('/api/auth/me', { token: user1Token });
  if (u1Me.role !== 'user') throw new Error('Expected user role');
  console.log('User1 /auth/me passed');

  const u2Me = await request('/api/auth/me', { token: user2Token });
  if (u2Me.role !== 'user') throw new Error('Expected user role');
  console.log('User2 /auth/me passed');

  const u1Contact = await request('/api/contacts', {
    method: 'POST',
    token: user1Token,
    body: { name: 'User1 Contact', phone: phone1, country: 'US', consent_status: 'opted_in', consent_source: 'smoke' },
  });
  console.log('User1 created contact');

  const u1ContactsList = await request('/api/contacts', { token: user1Token });
  const u1OwnContact = u1ContactsList.find((c) => c.id === u1Contact.id);
  if (!u1OwnContact) throw new Error('User1 cannot see own contact');
  console.log('User1 can view own contact');

  const u2ContactsList = await request('/api/contacts', { token: user2Token });
  const u2SawU1Contact = u2ContactsList.find((c) => c.id === u1Contact.id);
  if (u2SawU1Contact) throw new Error('User2 can see User1 contact - ISOLATION BROKEN');
  console.log('User isolation verified: User2 cannot see User1 contacts');

  const u1Number = await request('/api/numbers', {
    method: 'POST',
    token: user1Token,
    body: { phone_number: sender1, country: 'US', type: 'long-code', label: 'Main line', is_default: true },
  });
  console.log('User1 added number');

  const u1NumbersList = await request('/api/numbers', { token: user1Token });
  const u1OwnNumber = u1NumbersList.find((n) => n.id === u1Number.id);
  if (!u1OwnNumber) throw new Error('User1 cannot see own number');
  console.log('User1 can view own number');

  const u2NumbersList = await request('/api/numbers', { token: user2Token });
  const u2SawU1Number = u2NumbersList.find((n) => n.id === u1Number.id);
  if (u2SawU1Number) throw new Error('User2 can see User1 number - ISOLATION BROKEN');
  console.log('User isolation verified: User2 cannot see User1 numbers');

  await request('/api/numbers', {
    method: 'POST',
    token: user2Token,
    body: { phone_number: sender2, country: 'US', type: 'long-code', label: 'Main line', is_default: true },
  });
  console.log('User2 added number');

  await request('/api/admin/users', {
    method: 'PUT',
    token: adminToken,
    body: { user_id: null },
  }).catch(() => {});

  const sent = await request('/api/conversations/start', {
    method: 'POST',
    token: user1Token,
    body: { to: phone1, from: sender1, message: 'Smoke test message' },
  });
  if (!sent.conversation || !sent.message) throw new Error('Conversation creation failed');
  if (sent.mode !== 'mock' || sent.message.status !== 'sent_mock') throw new Error('Expected mock SMS send');
  console.log('Send mock message passed');

  const u1Conversations = await request('/api/conversations', { token: user1Token });
  if (!u1Conversations.length) throw new Error('Expected conversations for user1');
  console.log('Conversation list passed');

  const u2Conversations = await request('/api/conversations', { token: user2Token });
  const u2SawU1Conv = u2Conversations.find((c) => c.id === sent.conversation.id);
  if (u2SawU1Conv) throw new Error('User2 can see User1 conversation - ISOLATION BROKEN');
  console.log('User isolation verified: User2 cannot see User1 conversations');

  const u1Messages = await request(`/api/conversations/${sent.conversation.id}/messages`, { token: user1Token });
  if (!u1Messages.length) throw new Error('Expected messages');
  console.log('Messages retrieval passed');

  const saveNumberResult = await request('/api/contacts/save-from-conversation', {
    method: 'POST',
    token: user1Token,
    body: { phone: phone1, name: 'Saved Contact', conversation_id: sent.conversation.id },
  });
  console.log('Save number from conversation passed');

  await request('/webhooks/vonage/inbound', {
    method: 'POST',
    headers: webhookHeaders(),
    body: { from: phone1, to: sender1, text: 'Hello inbound', messageId: `in_${stamp}` },
  });
  console.log('Inbound webhook passed');

  await request('/webhooks/vonage/inbound', {
    method: 'POST',
    headers: webhookHeaders(),
    body: { from: phone1, to: sender1, text: 'STOP', messageId: `stop_${stamp}` },
  });
  console.log('STOP webhook passed');

  const contactsAfterStop = await request(`/api/contacts?search=${encodeURIComponent(phone1)}`, { token: user1Token });
  const stoppedContact = contactsAfterStop.find((c) => c.id === u1Contact.id);
  if (!stoppedContact || !stoppedContact.is_unsubscribed) throw new Error('STOP did not unsubscribe contact');
  console.log('STOP unsubscribe passed');

  await request('/api/conversations/start', {
    method: 'POST',
    token: user1Token,
    body: { to: phone1, from: sender1, message: 'Should be blocked' },
  }).then(() => {
    throw new Error('Suppressed number was allowed to receive a future send');
  }).catch((error) => {
    if (!String(error.message).includes('403')) throw error;
  });
  console.log('Suppression blocks future sends');

  const sent2 = await request('/api/conversations/start', {
    method: 'POST',
    token: user2Token,
    body: { to: phone2, from: sender2, message: 'User2 message' },
  });
  console.log('User2 sent message passed');

  await request('/api/admin/providers/status', { token: user1Token }).then(() => {
    throw new Error('Normal user can access admin provider settings');
  }).catch((error) => {
    if (!String(error.message).includes('403')) throw error;
  });
  console.log('Normal user cannot access admin provider settings');

  const adminProviders = await request('/api/admin/providers/status', { token: adminToken });
  if (!adminProviders.vonage || adminProviders.vonage.apiKeyMasked === process.env.VONAGE_API_KEY) {
    throw new Error('Admin provider status missing or unmasked');
  }
  console.log('Admin provider status passed');

  const statusMessage = sent.message.provider_message_id;
  await request('/webhooks/vonage/status', {
    method: 'POST',
    headers: webhookHeaders(),
    body: { messageId: statusMessage, status: 'delivered' },
  });
  const u1MessagesAfterStatus = await request(`/api/conversations/${sent.conversation.id}/messages`, { token: user1Token });
  const delivered = u1MessagesAfterStatus.find((m) => m.provider_message_id === statusMessage);
  if (!delivered || delivered.status !== 'delivered') throw new Error('Status webhook did not update message status');
  console.log('Status webhook passed');

  console.log('\n=== ALL SMOKE TESTS PASSED ===');
  process.exit(0);
}

main().catch((error) => {
  console.error('SMOKE TEST FAILED:', error.message);
  process.exit(1);
});
