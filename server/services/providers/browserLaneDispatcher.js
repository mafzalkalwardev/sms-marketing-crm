const { MESSAGE_STATUSES } = require('./ProviderAdapter');

async function sendViaBrowser({ profileId, to, text }) {
  const workerUrl = process.env.AUTOMATION_WORKER_URL;
  if (!workerUrl) {
    return {
      ok: false,
      provider: 'browser',
      mode: 'browser',
      status: MESSAGE_STATUSES.FAILED,
      error: 'Browser automation worker is not configured',
    };
  }

  try {
    const response = await fetch(`${workerUrl.replace(/\/$/, '')}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.WORKER_SERVICE_TOKEN || ''}`,
      },
      body: JSON.stringify({ profileId, to, text }),
    });
    const data = await response.json();
    return {
      ok: Boolean(data.ok),
      provider: 'browser',
      mode: 'browser',
      providerMessageId: data.providerMessageId || null,
      status: data.status || MESSAGE_STATUSES.SENT,
      error: data.error,
      raw: data,
    };
  } catch (error) {
    return {
      ok: false,
      provider: 'browser',
      mode: 'browser',
      status: MESSAGE_STATUSES.FAILED,
      error: error.message,
    };
  }
}

module.exports = { sendViaBrowser };
