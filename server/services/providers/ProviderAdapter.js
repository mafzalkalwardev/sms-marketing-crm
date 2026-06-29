const MESSAGE_STATUSES = {
  QUEUED: 'queued',
  SENDING: 'sending',
  SENT: 'sent',
  ACCEPTED: 'accepted',
  DELIVERED: 'delivered',
  FAILED: 'failed',
  REJECTED: 'rejected',
  UNDELIVERABLE: 'undeliverable',
  EXPIRED: 'expired',
  UNKNOWN: 'unknown',
  UNSUBSCRIBED: 'unsubscribed',
  SENT_MOCK: 'sent_mock',
};

const CUSTOMER_STATUS_MAP = {
  queued: 'sending',
  sending: 'sending',
  accepted: 'sent',
  sent: 'sent',
  sent_mock: 'sent',
  delivered: 'delivered',
  failed: 'failed',
  rejected: 'failed',
  undeliverable: 'undeliverable',
  expired: 'failed',
  unknown: 'sent',
  unsubscribed: 'unsubscribed',
};

class ProviderAdapter {
  static id = 'base';
  static lane = 'api';

  constructor() {}

  async sendSms() {
    throw new Error('Not implemented');
  }

  normalizeInbound() {
    throw new Error('Not implemented');
  }

  normalizeStatus() {
    throw new Error('Not implemented');
  }

  verifyWebhook() {
    return { ok: true };
  }

  mapStatus(raw) {
    const value = String(raw ?? '').toLowerCase();
    if (['0', 'accepted', 'submitted', 'queued'].includes(value)) return MESSAGE_STATUSES.ACCEPTED;
    if (value === 'delivered') return MESSAGE_STATUSES.DELIVERED;
    if (value === 'sent') return MESSAGE_STATUSES.SENT;
    if (['failed', 'undeliverable'].includes(value)) return MESSAGE_STATUSES.FAILED;
    if (value === 'rejected') return MESSAGE_STATUSES.REJECTED;
    return value || MESSAGE_STATUSES.UNKNOWN;
  }
}

module.exports = { ProviderAdapter, MESSAGE_STATUSES, CUSTOMER_STATUS_MAP };
