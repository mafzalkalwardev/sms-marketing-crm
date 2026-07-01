const { MESSAGE_STATUSES } = require('./ProviderAdapter');

function normalizePhone(phone) {
  return String(phone || '').trim().replace(/[^\d+]/g, '');
}

function mapGenericStatus(status) {
  const value = String(status ?? '').toLowerCase();
  if (['queued', 'accepted', 'submitted', 'sending', 'sent'].includes(value)) return MESSAGE_STATUSES.SENT;
  if (value === 'delivered') return MESSAGE_STATUSES.DELIVERED;
  if (['failed', 'undeliverable', 'undelivered', 'rejected'].includes(value)) return MESSAGE_STATUSES.FAILED;
  return value || MESSAGE_STATUSES.UNKNOWN;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    signal: options.signal || AbortSignal.timeout(10000),
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(data.errors?.[0]?.detail || data.message || data.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.response = data;
    throw error;
  }
  return data;
}

module.exports = { normalizePhone, mapGenericStatus, fetchJson };
