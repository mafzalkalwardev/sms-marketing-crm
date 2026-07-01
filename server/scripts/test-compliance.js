require('dotenv').config({ quiet: true });
const jwt = require('jsonwebtoken');

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
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

async function run() {
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'user1@demo.local', password: 'password123' },
  });

  const summary = await request('/api/compliance/summary', { token: login.token });
  if (!Array.isArray(summary.stopKeywords)) throw new Error('stopKeywords missing');

  const list = await request('/api/compliance/suppressions', { token: login.token });
  if (!Array.isArray(list)) throw new Error('suppressions list missing');

  const reports = await request('/api/reports/messages?limit=5', { token: login.token });
  if (!Array.isArray(reports)) throw new Error('reports messages missing');

  console.log(`Compliance test passed (suppressed=${summary.suppressedNumbers}, log=${list.length} rows)`);
}

run().catch((error) => {
  console.error('FAILED:', error.message);
  process.exit(1);
});
