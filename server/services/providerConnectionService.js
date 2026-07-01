const { queryOne } = require('../config/database');
const providerRouter = require('./providers/providerRouter');
const { sendTextMessage, normalizePhone } = require('./smsService');

const WARMUP_MESSAGE =
  process.env.PROVIDER_WARMUP_MESSAGE ||
  'SignalMint warm-up: your dialer backend is connected and ready.';

async function testProviderConnection(providerRow) {
  if (!providerRow) {
    return { ok: false, connected: false, error: 'Provider not found' };
  }

  const resolved = await providerRouter.resolveCredentials(providerRow);

  if (typeof resolved.adapter?.testConnection === 'function') {
    const result = await resolved.adapter.testConnection(resolved.credentials);
    return { provider: resolved.providerKey, connected: Boolean(result.ok), ...result };
  }

  return {
    ok: false,
    provider: resolved.providerKey,
    connected: false,
    error: 'No connection test available for this dialer',
  };
}

function defaultWarmupFrom(resolved) {
  return normalizePhone(
    process.env.VONAGE_DEFAULT_FROM ||
    process.env.TWILIO_DEFAULT_FROM ||
    '+15550009999'
  );
}

async function sendWarmupMessage({ user, providerId, to, from, message }) {
  const providerRow = await queryOne('SELECT * FROM providers WHERE id = $1', [providerId]);
  if (!providerRow) {
    const error = new Error('Provider not found');
    error.status = 404;
    throw error;
  }

  const resolved = await providerRouter.resolveCredentials(providerRow);
  const toNorm = normalizePhone(to);
  const fromNorm = normalizePhone(from || defaultWarmupFrom(resolved));
  const text = String(message || WARMUP_MESSAGE).trim();

  if (!toNorm) {
    const error = new Error('Warm-up recipient number is required');
    error.status = 400;
    throw error;
  }

  const connection = await testProviderConnection(providerRow);
  if (!connection.ok) {
    const error = new Error(connection.error || 'Provider connection check failed');
    error.status = 502;
    error.connection = connection;
    throw error;
  }

  const result = await sendTextMessage({
    user,
    to: toNorm,
    from: fromNorm,
    message: text,
    contactName: 'Connection warm-up',
    workspaceId: 1,
    allowEnvSender: true,
    isTest: true,
    providerId,
  });

  return {
    ok: result.ok,
    connection,
    warmup: {
      to: toNorm,
      from: fromNorm,
      message: text,
      mode: result.mode,
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      status: result.status,
      error: result.error,
    },
  };
}

async function connectProvider({ user, providerId, warmupTo, from, message, skipWarmup = false }) {
  const providerRow = await queryOne('SELECT * FROM providers WHERE id = $1', [providerId]);
  if (!providerRow) {
    const error = new Error('Provider not found');
    error.status = 404;
    throw error;
  }

  const connection = await testProviderConnection(providerRow);
  let warmup = null;

  if (!skipWarmup && warmupTo) {
    try {
      warmup = await sendWarmupMessage({
        user,
        providerId,
        to: warmupTo,
        from,
        message,
      });
    } catch (error) {
      warmup = {
        ok: false,
        error: error.message,
        connection: error.connection || connection,
      };
    }
  }

  return { connection, warmup };
}

module.exports = {
  WARMUP_MESSAGE,
  testProviderConnection,
  sendWarmupMessage,
  connectProvider,
};
