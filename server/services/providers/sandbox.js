function isSandboxMode() {
  if (process.env.SMS_SANDBOX_MODE !== undefined) {
    return String(process.env.SMS_SANDBOX_MODE).toLowerCase() !== 'false';
  }
  return String(process.env.VONAGE_MOCK_MODE || 'true').toLowerCase() !== 'false';
}

function shouldUseMockSend(resolved) {
  if (isSandboxMode()) return true;
  if (resolved.adapterType === 'browser') {
    return !process.env.AUTOMATION_WORKER_URL;
  }
  const live = resolved.adapter?.configuredForLive?.(resolved.credentials);
  return !live;
}

module.exports = { isSandboxMode, shouldUseMockSend };
