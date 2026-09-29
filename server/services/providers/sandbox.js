function isSandboxMode() {
  if (process.env.SMS_SANDBOX_MODE !== undefined) {
    return String(process.env.SMS_SANDBOX_MODE).toLowerCase() !== 'false';
  }
  return String(process.env.VONAGE_MOCK_MODE || 'true').toLowerCase() !== 'false';
}

function shouldUseMockSend(resolved, { organizationDeliveryMode, userStatus } = {}) {
  if (userStatus && userStatus !== 'active') return true;

  // Paired eSIM agent can send live even while other providers stay in sandbox.
  if (resolved.providerKey === 'esim' || resolved.adapterType === 'esim') {
    if (resolved.esimPaired) return false;
    return true;
  }

  // Sent uses its own API sandbox flag inside the adapter when SMS_SANDBOX_MODE=true.
  if (resolved.providerKey === 'sent' && resolved.adapter?.isConfigured?.(resolved.credentials)) {
    return false;
  }

  if (isSandboxMode()) return true;
  if (organizationDeliveryMode && organizationDeliveryMode !== 'live') return true;
  if (resolved.adapterType === 'browser') {
    return !process.env.AUTOMATION_WORKER_URL;
  }
  const live = resolved.adapter?.configuredForLive?.(resolved.credentials);
  return !live;
}

module.exports = { isSandboxMode, shouldUseMockSend };
