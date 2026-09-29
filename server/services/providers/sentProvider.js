const { MESSAGE_STATUSES } = require('./ProviderAdapter');
const { isSandboxMode } = require('./sandbox');
const { normalizePhone, mapGenericStatus, fetchJson } = require('./httpUtils');
const mockProvider = require('./mockProvider');

const SENT_API_BASE = 'https://api.sent.dm';

function resolveApiKey(credentials = {}) {
  return credentials.apiKey || credentials.api_key || process.env.SENT_API_KEY || '';
}

function isConfigured(credentials = {}) {
  return Boolean(resolveApiKey(credentials));
}

function configuredForLive(credentials = {}) {
  return isConfigured(credentials) && !isSandboxMode();
}

function authHeaders(credentials = {}) {
  return {
    'x-api-key': resolveApiKey(credentials),
    'Content-Type': 'application/json',
  };
}

function mapSentStatus(status) {
  const value = String(status || '').toLowerCase();
  if (['queued', 'scheduled', 'routed', 'accepted', 'sending', 'sent'].includes(value)) {
    return MESSAGE_STATUSES.SENT;
  }
  if (['delivered', 'read'].includes(value)) return MESSAGE_STATUSES.DELIVERED;
  if (['failed', 'blocked', 'undelivered', 'rejected', 'filtered'].includes(value)) {
    return MESSAGE_STATUSES.FAILED;
  }
  return mapGenericStatus(status);
}

function sentErrorMessage(error) {
  const payload = error?.response || {};
  return (
    payload.error?.message ||
    payload.message ||
    (typeof payload.error === 'string' ? payload.error : null) ||
    error.message ||
    'Sent API error'
  );
}

async function testConnection(credentials = {}) {
  if (!isConfigured(credentials)) {
    return { ok: false, error: 'Missing Sent API key' };
  }
  try {
    const data = await fetchJson(`${SENT_API_BASE}/v3/templates?page_size=1`, {
      headers: authHeaders(credentials),
    });
    return {
      ok: Boolean(data.success !== false),
      mode: isSandboxMode() ? 'sandbox' : 'live',
      templates: data.data?.templates?.length ?? data.data?.pagination?.total_count ?? null,
    };
  } catch (error) {
    return { ok: false, mode: 'live', error: sentErrorMessage(error) };
  }
}

function shouldUseVerifyTemplate({ credentials = {}, text = '', conversationReply = false }) {
  if (conversationReply || credentials.conversationReply === true) return false;
  if (credentials.useTemplate === false) return false;
  const templateId =
    credentials.templateId ||
    credentials.template_id ||
    process.env.SENT_TEMPLATE_ID ||
    '';
  if (!templateId) return false;
  // Verify-code template only accepts short numeric codes, not free-form inbox replies.
  const bodyText = String(text || '').trim();
  if (/^\d{4,8}$/.test(bodyText)) return true;
  return credentials.forceTemplate === true;
}

async function sendSms({ to, from, text, credentials = {}, conversationReply = false } = {}) {
  if (!isConfigured(credentials)) {
    return mockProvider.sendSms({ to, from, text, provider: 'sent' });
  }

  // Call Sent even in SignalMint sandbox — use Sent's sandbox flag so the path is real.
  const useSentSandbox = isSandboxMode() || credentials.sandbox === true;
  const templateId =
    credentials.templateId ||
    credentials.template_id ||
    process.env.SENT_TEMPLATE_ID ||
    '';
  const bodyText = String(text || '');
  const useTemplate = shouldUseVerifyTemplate({ credentials, text: bodyText, conversationReply });

  try {
    const payload = {
      to: [normalizePhone(to)],
      channel: ['sms'],
      sandbox: useSentSandbox,
    };

    // Cold outbound / OTP uses the approved verify template. Inbox replies use free text.
    if (useTemplate && templateId) {
      payload.template = {
        id: templateId,
        parameters: {
          var_1: bodyText.slice(0, 60) || '000000',
          message: bodyText,
          body: bodyText,
        },
      };
    } else {
      payload.text = bodyText;
    }

    const data = await fetchJson(`${SENT_API_BASE}/v3/messages`, {
      method: 'POST',
      headers: authHeaders(credentials),
      body: JSON.stringify(payload),
    });

    const recipient = data.data?.recipients?.[0] || {};
    const providerMessageId = recipient.message_id || data.data?.message_id || null;
    let status = mapSentStatus(data.data?.status || recipient.status || 'queued');
    let error = data.success === false ? (data.error?.message || 'Sent send failed') : null;

    // Sent accepts the HTTP request then may BLOCK async; poll briefly for terminal status.
    if (providerMessageId && status !== MESSAGE_STATUSES.FAILED) {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 400 : 700));
        try {
          const detail = await fetchJson(`${SENT_API_BASE}/v3/messages/${providerMessageId}`, {
            headers: authHeaders(credentials),
          });
          const row = detail.data || {};
          status = mapSentStatus(row.status || row.message_status);
          if (status === MESSAGE_STATUSES.FAILED) {
            error =
              row.reason ||
              row.error?.message ||
              row.reason_code ||
              'Sent blocked this message (conversation window closed)';
            break;
          }
          if ([MESSAGE_STATUSES.DELIVERED, MESSAGE_STATUSES.SENT].includes(status)) break;
        } catch {
          break;
        }
      }
    }

    const ok = data.success !== false && status !== MESSAGE_STATUSES.FAILED && Boolean(providerMessageId || data.data?.status);

    return {
      ok,
      provider: 'sent',
      mode: useSentSandbox ? 'sandbox' : 'live',
      providerMessageId,
      status: ok ? status : MESSAGE_STATUSES.FAILED,
      error: ok ? null : (error || 'Sent send failed'),
      raw: data,
    };
  } catch (error) {
    return {
      ok: false,
      provider: 'sent',
      mode: useSentSandbox ? 'sandbox' : 'live',
      status: MESSAGE_STATUSES.FAILED,
      error: sentErrorMessage(error),
      raw: error.response || null,
    };
  }
}

function sentPayload(body) {
  return body?.payload || body?.data || body?.message || body || {};
}

function isSentInboundEvent(body) {
  const field = String(body?.field || '').toLowerCase();
  const event = String(body?.event || body?.type || body?.event_type || '').toLowerCase();
  return field === 'message' && event === 'message.received';
}

function normalizeInbound(body) {
  const payload = sentPayload(body);
  const eventType = String(body?.event || body?.type || body?.event_type || '').toLowerCase();

  if (isSentInboundEvent(body)) {
    return {
      from: normalizePhone(payload.inbound_number || payload.from),
      to: normalizePhone(payload.outbound_number || payload.to || process.env.SENT_DEFAULT_FROM),
      text: payload.text || payload.body || payload.message || payload.content || '',
      providerMessageId: payload.message_id || payload.id || null,
    };
  }

  // Ignore outbound status events when a combined webhook URL is used.
  if (eventType.startsWith('message.') && eventType !== 'message.received') {
    return { from: null, to: null, text: '', providerMessageId: null };
  }

  return {
    from: normalizePhone(
      payload.inbound_number || payload.from || payload.sender || payload.source || payload.phone
    ),
    to: normalizePhone(
      payload.outbound_number || payload.to || payload.recipient || payload.destination || process.env.SENT_DEFAULT_FROM
    ),
    text: payload.text || payload.body || payload.message || payload.content || '',
    providerMessageId: payload.message_id || payload.id || body?.id || null,
  };
}

function normalizeStatus(body) {
  const payload = sentPayload(body);
  const event = String(body?.event || body?.type || body?.event_type || '').toLowerCase();
  let status = payload.message_status || payload.status || event;

  if (event.startsWith('message.')) {
    status = event.slice('message.'.length);
    if (status === 'blocked') {
      return {
        providerMessageId: payload.message_id || payload.id || body?.id || null,
        status: MESSAGE_STATUSES.FAILED,
        errorMessage:
          payload.reason ||
          payload.reason_code ||
          'Sent blocked this message (conversation window closed)',
      };
    }
  }

  return {
    providerMessageId: payload.message_id || payload.id || body?.id || null,
    status: mapSentStatus(status),
    errorMessage: payload.error?.message || payload.error_message || payload.error || null,
  };
}

module.exports = {
  id: 'sent',
  label: 'Sent',
  lane: 'api',
  isConfigured,
  configuredForLive,
  testConnection,
  sendSms,
  isSentInboundEvent,
  normalizeInbound,
  normalizeStatus,
  mapStatus: mapSentStatus,
};
