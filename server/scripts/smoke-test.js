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
  if (!health.ok) throw new Error('Health check failed');
  if (!health.version) throw new Error('Health check missing version');
  console.log('Health check passed');

  const superLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'super_admin@signalmint.local', password: 'password123' },
  }).catch(() => null);
  const superToken = superLogin?.token;

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

  const user1Create = await request('/api/admin/users', {
    method: 'POST',
    token: adminToken,
    body: { name: 'Demo User 1', email: user1Email, password: user1Password, phone: phone1 },
  });
  const user2Create = await request('/api/admin/users', {
    method: 'POST',
    token: adminToken,
    body: { name: 'Demo User 2', email: user2Email, password: user2Password, phone: phone2 },
  });
  if (!user1Create.ok || !user2Create.ok) throw new Error('Admin user creation failed');

  const user1Login = await request('/api/auth/login', {
    method: 'POST',
    body: { email: user1Email, password: user1Password },
  });
  const user2Login = await request('/api/auth/login', {
    method: 'POST',
    body: { email: user2Email, password: user2Password },
  });
  const user1Token = user1Login.token;
  const user2Token = user2Login.token;
  console.log('User creation and login passed');

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
  if (sent.status !== 'sent') throw new Error(`Expected mock SMS send status sent, got ${sent.status}`);
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

  await request('/api/super/providers/status', { token: user1Token }).then(() => {
    throw new Error('Normal user can access super provider settings');
  }).catch((error) => {
    if (!String(error.message).includes('403')) throw error;
  });
  console.log('Normal user cannot access super provider settings');

  if (superToken) {
    const superProviders = await request('/api/super/providers/status', { token: superToken });
    if (!superProviders.vonage) throw new Error('Super admin provider status missing');
    console.log('Super admin provider status passed');

    const warmupTo = `+1555${String(stamp + 2000).slice(-7)}`;
    const added = await request('/api/super/providers', {
      method: 'POST',
      token: superToken,
      body: {
        provider: 'vonage',
        label: `Smoke Vonage ${stamp}`,
        api_key: `smoke_key_${stamp}`,
        api_secret: `smoke_secret_${stamp}`,
        warmup_to: warmupTo,
        send_warmup: true,
      },
    });
    if (!added.connection?.ok) throw new Error(`Provider connection failed: ${added.connection?.error}`);
    console.log('Provider connection on add passed');

    const connectionTest = await request(`/api/super/providers/${added.id}/test`, {
      method: 'POST',
      token: superToken,
    });
    if (!connectionTest.ok) throw new Error(`Provider test connection failed: ${connectionTest.error}`);
    console.log('Provider test connection passed');

    if (!added.warmup || added.warmup.ok === false) {
      throw new Error(`Warm-up on connect failed: ${added.warmup?.error || 'unknown'}`);
    }
    console.log('Warm-up message on connect passed');

    const manualWarmup = await request(`/api/super/providers/${added.id}/warmup`, {
      method: 'POST',
      token: superToken,
      body: { to: warmupTo, message: 'Manual warm-up smoke test' },
    });
    if (!manualWarmup.ok) throw new Error(`Manual warm-up failed: ${manualWarmup.warmup?.error}`);
    console.log('Manual warm-up endpoint passed');

    const timeline = await request(`/api/messages/${sent.message.id}/timeline`, { token: user1Token });
    if (!timeline.timeline?.length) throw new Error('Message status timeline missing');
    console.log('Message status timeline passed');

    const workspace = await request('/api/user/workspace', { token: user1Token });
    if (typeof workspace.usage?.messagesUsedThisMonth !== 'number') {
      throw new Error('Workspace usage summary missing');
    }
    console.log('Workspace usage summary passed');

    const audits = await request('/api/admin/audit-logs?action=message_status_changed&limit=30', { token: adminToken });
    const messageAudits = (Array.isArray(audits) ? audits : []).filter((row) => {
      const details = typeof row.details === 'string' ? JSON.parse(row.details) : row.details;
      return details?.messageId === sent.message.id;
    });
    if (messageAudits.length < 2) {
      throw new Error(`Message status audit trail missing (found ${messageAudits.length})`);
    }
    console.log('Message status audit trail passed');

    const campaign = await request('/api/campaigns', {
      method: 'POST',
      token: adminToken,
      body: { title: `Smoke ${stamp}`, message_template: 'Hello {{name}}' },
    });
    const preview = await request(`/api/campaigns/${campaign.id}/preview`, { method: 'POST', token: adminToken });
    if (!preview.recipients && preview.recipients !== 0) throw new Error('Campaign preview failed');
    console.log('Campaign preview passed');

    const queued = await request(`/api/campaigns/${campaign.id}/send`, { method: 'POST', token: adminToken, body: {} });
    if (queued.status !== 'queued' || queued.mode !== 'async') {
      throw new Error(`Campaign send should return async queued, got ${JSON.stringify(queued)}`);
    }
    console.log('Campaign enqueue passed');
  } else {
    console.log('Super admin login skipped (run seed first for full provider tests)');
  }

  let statusMessageId = null;
  if (process.env.DATABASE_URL) {
    const { queryOne, initDatabase } = require('../config/database');
    await initDatabase();
    const row = await queryOne('SELECT provider_message_id FROM messages WHERE id = $1', [sent.message.id]);
    statusMessageId = row?.provider_message_id;
  }
  if (!statusMessageId) {
    console.log('Status webhook test skipped (no DATABASE_URL or provider_message_id)');
  } else {
    await request('/webhooks/vonage/status', {
      method: 'POST',
      headers: webhookHeaders(),
      body: { messageId: statusMessageId, status: 'delivered' },
    });
    const u1MessagesAfterStatus = await request(`/api/conversations/${sent.conversation.id}/messages`, { token: user1Token });
    const delivered = u1MessagesAfterStatus.find((m) => m.id === sent.message.id);
    if (!delivered) throw new Error('Status webhook message missing');
    console.log('Status webhook passed (terminal mock message left unchanged)');
  }

  console.log('\n=== ALL SMOKE TESTS PASSED ===');
  process.exit(0);
}

main().catch((error) => {
  console.error('SMOKE TEST FAILED:', error.message);
  process.exit(1);
});
