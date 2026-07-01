const { MESSAGE_STATUSES } = require('./ProviderAdapter');
const { isSandboxMode } = require('./sandbox');
const mockProvider = require('./mockProvider');
const { sendViaBrowser } = require('./browserLaneDispatcher');

function createBrowserDialerProvider(id, label) {
  function isConfigured(credentials = {}) {
    return Boolean(credentials.baseUrl || process.env.AUTOMATION_WORKER_URL);
  }

  function configuredForLive(credentials = {}) {
    return Boolean(process.env.AUTOMATION_WORKER_URL) && !isSandboxMode();
  }

  async function testConnection(credentials = {}) {
    if (!credentials.baseUrl && !process.env.AUTOMATION_WORKER_URL) {
      return { ok: false, error: 'Browser dialer requires portal URL or automation worker' };
    }
    if (isSandboxMode()) {
      return {
        ok: true,
        mode: 'sandbox',
        connected: true,
        note: `${label} profile configured; messages simulate until worker is live`,
        portalUrl: credentials.baseUrl || null,
      };
    }
    const workerUrl = process.env.AUTOMATION_WORKER_URL;
    if (!workerUrl) {
      return { ok: false, error: 'AUTOMATION_WORKER_URL is not configured' };
    }
    try {
      const response = await fetch(`${workerUrl.replace(/\/$/, '')}/health`, {
        headers: { Authorization: `Bearer ${process.env.WORKER_SERVICE_TOKEN || ''}` },
        signal: AbortSignal.timeout(5000),
      });
      return {
        ok: response.ok,
        mode: 'browser',
        connected: response.ok,
        portalUrl: credentials.baseUrl || null,
        error: response.ok ? undefined : `Worker health returned ${response.status}`,
      };
    } catch (error) {
      return { ok: false, mode: 'browser', connected: false, error: error.message };
    }
  }

  async function sendSms({ to, from, text, credentials = {}, profileId = null }) {
    if (!configuredForLive(credentials)) {
      const mock = await mockProvider.sendSms({ to, from, text });
      return { ...mock, provider: id, mode: 'sandbox' };
    }
    const result = await sendViaBrowser({ profileId, to, text });
    return { ...result, provider: id };
  }

  function normalizeInbound(body) {
    return {
      from: String(body.from || '').trim(),
      to: String(body.to || '').trim(),
      text: body.text || body.message || '',
      providerMessageId: body.providerMessageId || body.id || null,
    };
  }

  function normalizeStatus(body) {
    return {
      providerMessageId: body.providerMessageId || body.id || null,
      status: body.status || MESSAGE_STATUSES.SENT,
      errorMessage: body.error || null,
    };
  }

  return {
    id,
    label,
    lane: 'browser',
    isConfigured,
    configuredForLive,
    testConnection,
    sendSms,
    normalizeInbound,
    normalizeStatus,
  };
}

module.exports = { createBrowserDialerProvider };
