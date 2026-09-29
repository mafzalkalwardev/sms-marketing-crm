#!/usr/bin/env node
require('dotenv').config({ override: true });
const { fetchJson } = require('../services/providers/httpUtils');

const SENT_API_BASE = 'https://api.sent.dm';

function authHeaders() {
  const apiKey = process.env.SENT_API_KEY;
  if (!apiKey) throw new Error('Missing SENT_API_KEY');
  return { 'x-api-key': apiKey, 'Content-Type': 'application/json' };
}

function webhookUrl() {
  const base = (process.env.PUBLIC_BACKEND_URL || 'https://signalmint-api-eight.vercel.app').replace(/\/$/, '');
  return `${base}/webhooks/sent`;
}

async function listWebhooks() {
  const data = await fetchJson(`${SENT_API_BASE}/v3/webhooks`, { headers: authHeaders() });
  return data.data?.webhooks || data.data || [];
}

async function main() {
  const endpoint = webhookUrl();
  const displayName = process.env.SENT_WEBHOOK_NAME || 'SignalMint Inbox';
  const hooks = await listWebhooks();
  const existing =
    hooks.find((row) => row.endpoint_url === endpoint) ||
    hooks.find((row) => row.display_name === displayName) ||
    hooks[0];

  if (existing) {
    if (existing.endpoint_url !== endpoint) {
      const updated = await fetchJson(`${SENT_API_BASE}/v3/webhooks/${existing.id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          display_name: displayName,
          endpoint_url: endpoint,
          event_types: ['message'],
          retry_count: 3,
          timeout_seconds: 30,
        }),
      });
      if (updated.success === false) {
        throw new Error(updated.error?.message || 'Failed to update Sent webhook');
      }
      console.log(
        JSON.stringify(
          {
            ok: true,
            action: 'updated',
            id: updated.data?.id || existing.id,
            endpoint_url: updated.data?.endpoint_url || endpoint,
          },
          null,
          2
        )
      );
      return;
    }

    console.log(JSON.stringify({ ok: true, action: 'exists', id: existing.id, endpoint_url: existing.endpoint_url }, null, 2));
    return;
  }

  const created = await fetchJson(`${SENT_API_BASE}/v3/webhooks`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      display_name: displayName,
      endpoint_url: endpoint,
      event_types: ['message'],
      retry_count: 3,
      timeout_seconds: 30,
    }),
  });

  if (created.success === false) {
    throw new Error(created.error?.message || 'Failed to create Sent webhook');
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        action: 'created',
        id: created.data?.id,
        endpoint_url: created.data?.endpoint_url,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
