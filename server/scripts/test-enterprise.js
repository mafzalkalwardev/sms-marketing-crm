require('dotenv').config({ quiet: true });

const API = process.env.SMOKE_API_URL || 'http://localhost:5000';

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { ok: response.ok, status: response.status, data, text };
}

async function run() {
  const stamp = Date.now();

  const adminLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@ftsolutions.local', password: 'password123' },
  });
  if (!adminLogin.data.token) throw new Error('Admin login failed');
  const adminToken = adminLogin.data.token;

  const acmeAdmin = await request('/api/auth/register', {
    method: 'POST',
    body: {
      name: 'Acme Admin',
      email: `acme-admin-${stamp}@example.com`,
      password: 'password123',
    },
  });

  const { query, queryOne, initDatabase } = require('../config/database');
  await initDatabase();
  await query('UPDATE users SET organization_id = 2, workspace_id = 2, role = $1 WHERE email = $2', [
    'admin',
    acmeAdmin.data.user?.email || `acme-admin-${stamp}@example.com`,
  ]);

  const acmeUser = await query(
    `INSERT INTO users (name, email, password_hash, role, status, organization_id, workspace_id)
     VALUES ('Acme User', $1, 'x', 'user', 'active', 2, 2) RETURNING id, organization_id`,
    [`acme-user-${stamp}@example.com`]
  ).then((r) => r.rows[0]);

  const adminRow = await queryOne('SELECT id, role, organization_id FROM users WHERE email = $1', ['admin@ftsolutions.local']);
  if (adminRow?.role === 'super_admin') {
    throw new Error('Test requires org-scoped admin, not super_admin');
  }
  if (Number(acmeUser.organization_id) !== 2) {
    throw new Error(`Acme user setup failed (org=${acmeUser.organization_id})`);
  }

  const crossOrg = await request(`/api/admin/users/${acmeUser.id}/status`, {
    method: 'PUT',
    token: adminToken,
    body: { status: 'suspended' },
  });
  if (crossOrg.ok || crossOrg.status !== 403) {
    throw new Error(`Expected 403 for cross-org suspend, got ${crossOrg.status}`);
  }

  const branding = await request('/api/admin/branding', {
    method: 'PUT',
    token: adminToken,
    body: { brand_name: 'FT Solutions Text', primary_color: '#0f766e' },
  });
  if (!branding.ok || branding.data.brandName !== 'FT Solutions Text') {
    throw new Error('Branding update failed');
  }

  const userBranding = await request('/api/user/branding', { token: adminToken });
  if (!userBranding.ok || userBranding.data.brandName !== 'FT Solutions Text') {
    throw new Error('User branding read failed');
  }

  const createdKey = await request('/api/admin/api-keys', {
    method: 'POST',
    token: adminToken,
    body: { name: `Enterprise test ${stamp}` },
  });
  if (!createdKey.data.key?.startsWith('smk_')) throw new Error('API key creation failed');

  const contacts = await request('/api/v1/contacts', { apiKey: createdKey.data.key });
  if (!contacts.ok || !Array.isArray(contacts.data.contacts)) {
    throw new Error('API key contacts call failed');
  }

  const exportCsv = await fetch(`${API}/api/admin/audit-logs/export`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const csv = await exportCsv.text();
  if (!exportCsv.ok || !csv.includes('action,actor_name')) {
    throw new Error('Audit export failed');
  }

  await request(`/api/admin/api-keys/${createdKey.data.id}`, {
    method: 'DELETE',
    token: adminToken,
  });

  console.log('Enterprise phase test passed (org isolation, branding, API key, audit export)');
}

run().catch((error) => {
  console.error('FAILED:', error.message);
  process.exit(1);
});
