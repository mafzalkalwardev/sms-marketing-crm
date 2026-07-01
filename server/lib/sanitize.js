const { CUSTOMER_STATUS_MAP } = require('../services/providers/ProviderAdapter');

function sanitizeMessage(row) {
  if (!row) return row;
  const copy = { ...row };
  delete copy.provider;
  delete copy.provider_id;
  delete copy.provider_message_id;
  delete copy.metadata;
  delete copy.internal_error_code;
  delete copy.error_message;
  if (copy.status) {
    copy.status = CUSTOMER_STATUS_MAP[copy.status] || copy.status;
  }
  return copy;
}

function sanitizeMessages(rows) {
  return (rows || []).map(sanitizeMessage);
}

function sanitizeSendResult(result) {
  if (!result) return result;
  return {
    ok: result.ok,
    status: CUSTOMER_STATUS_MAP[result.status] || result.status,
    message: sanitizeMessage(result.message),
    conversationId: result.conversation?.id,
    contactId: result.contact?.id,
    error: result.ok ? undefined : 'Message could not be sent. Try again or contact support.',
  };
}

module.exports = { sanitizeMessage, sanitizeMessages, sanitizeSendResult };
