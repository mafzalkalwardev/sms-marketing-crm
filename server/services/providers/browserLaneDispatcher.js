const { MESSAGE_STATUSES } = require('./ProviderAdapter');
const { isSandboxMode } = require('./sandbox');
const browserProfileService = require('../browserProfileService');
const { query, queryOne } = require('../../config/database');

async function callWorker(path, body) {
  const workerUrl = process.env.AUTOMATION_WORKER_URL;
  if (!workerUrl) {
    return { ok: false, error: 'Browser automation worker is not configured' };
  }
  const response = await fetch(`${workerUrl.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.WORKER_SERVICE_TOKEN || ''}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Number(process.env.WORKER_TIMEOUT_MS || 60000)),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, error: data.detail || data.error || `Worker HTTP ${response.status}`, raw: data };
  }
  return { ok: Boolean(data.ok !== false), ...data };
}

async function sendViaBrowser({ profileId, providerId, to, text, messageId = null }) {
  const profile = profileId
    ? await browserProfileService.getProfile(profileId)
    : await browserProfileService.getProfileByProviderId(providerId);

  if (!profile) {
    if (isSandboxMode()) {
      const mockProvider = require('./mockProvider');
      const mock = await mockProvider.sendSms({ to, from: '+15550000000', text, provider: 'browser' });
      return { ...mock, mode: 'sandbox', provider: 'browser' };
    }
    return {
      ok: false,
      provider: 'browser',
      mode: 'browser',
      status: MESSAGE_STATUSES.FAILED,
      error: 'No browser profile configured for this dialer',
    };
  }

  const payload = browserProfileService.buildWorkerPayload(profile, { to, text });
  const job = await browserProfileService.recordJob({
    profileId: profile.id,
    providerId: profile.provider_id,
    messageId,
    jobType: 'send',
    status: 'queued',
    payload,
  });

  if (isSandboxMode() && !process.env.AUTOMATION_WORKER_URL) {
    const mockProvider = require('./mockProvider');
    const mock = await mockProvider.sendSms({ to, from: '+15550000000', text, provider: profile.adapter_id });
    await browserProfileService.recordJob({
      profileId: profile.id,
      providerId: profile.provider_id,
      messageId,
      jobType: 'send',
      status: 'completed',
      payload,
      result: mock,
    });
    return { ...mock, mode: 'sandbox', provider: profile.adapter_id };
  }

  try {
    const data = await callWorker('/send', payload);
    await queryUpdateJob(job.id, data.ok ? 'completed' : 'failed', data, data.error);

    return {
      ok: Boolean(data.ok),
      provider: profile.adapter_id,
      mode: data.mode || 'browser',
      providerMessageId: data.providerMessageId || null,
      status: data.status || (data.ok ? MESSAGE_STATUSES.SENT : MESSAGE_STATUSES.FAILED),
      error: data.error,
      raw: data,
    };
  } catch (error) {
    await queryUpdateJob(job.id, 'failed', null, error.message);
    return {
      ok: false,
      provider: profile.adapter_id,
      mode: 'browser',
      status: MESSAGE_STATUSES.FAILED,
      error: error.message,
    };
  }
}

async function queryUpdateJob(jobId, status, result, errorMessage) {
  await query(
    `UPDATE browser_jobs SET status = $1, result = $2::jsonb, error_message = $3, updated_at = NOW() WHERE id = $4`,
    [status, result ? JSON.stringify(result) : null, errorMessage || null, jobId]
  );
}

async function checkWorkerHealth() {
  const workerUrl = process.env.AUTOMATION_WORKER_URL;
  if (!workerUrl) return { configured: false, ok: null };
  try {
    const response = await fetch(`${workerUrl.replace(/\/$/, '')}/health`, {
      headers: { Authorization: `Bearer ${process.env.WORKER_SERVICE_TOKEN || ''}` },
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json().catch(() => ({}));
    return { configured: true, ok: response.ok, worker: data };
  } catch {
    return { configured: true, ok: false };
  }
}

async function startLoginSession(profileId) {
  const profile = await browserProfileService.getProfile(profileId);
  if (!profile) {
    const error = new Error('Browser profile not found');
    error.status = 404;
    throw error;
  }
  const payload = browserProfileService.buildWorkerPayload(profile, { to: '', text: '' });
  const data = await callWorker('/session/login', payload);
  if (data.sessionStatus) {
    await browserProfileService.updateProfile(profileId, { sessionStatus: data.sessionStatus });
  }
  return data;
}

async function syncSessionStatus(profileId, data) {
  if (!data?.sessionStatus) return;
  await browserProfileService.updateProfile(profileId, { sessionStatus: data.sessionStatus });
}

async function pollInbound(profileId) {
  const profile = await browserProfileService.getProfile(profileId);
  if (!profile) {
    const error = new Error('Browser profile not found');
    error.status = 404;
    throw error;
  }
  const payload = browserProfileService.buildWorkerPayload(profile, { to: '', text: '' });
  const data = await callWorker('/poll/inbound', payload);
  await browserProfileService.touchPoll(profileId);
  await syncSessionStatus(profileId, data);
  return data;
}

async function getSessionStatus(profileId) {
  const profile = await browserProfileService.getProfile(profileId);
  if (!profile) {
    const error = new Error('Browser profile not found');
    error.status = 404;
    throw error;
  }
  const workerUrl = process.env.AUTOMATION_WORKER_URL;
  if (!workerUrl) {
    return { ok: true, sessionStatus: profile.session_status, mode: 'sandbox' };
  }
  const payload = browserProfileService.buildWorkerPayload(profile, { to: '', text: '' });
  let data = await callWorker('/session/status', payload);
  if (!data.sessionStatus) {
    const response = await fetch(`${workerUrl.replace(/\/$/, '')}/session/${profileId}/status`, {
      headers: { Authorization: `Bearer ${process.env.WORKER_SERVICE_TOKEN || ''}` },
      signal: AbortSignal.timeout(10000),
    });
    const legacy = await response.json().catch(() => ({}));
    if (legacy.sessionStatus) data = legacy;
  }
  await syncSessionStatus(profileId, data);
  return data;
}

module.exports = {
  sendViaBrowser,
  checkWorkerHealth,
  startLoginSession,
  pollInbound,
  getSessionStatus,
  callWorker,
};
