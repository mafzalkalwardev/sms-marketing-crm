const LABELS = {
  sending: 'Sending',
  sent: 'Sent',
  delivered: 'Delivered',
  failed: 'Failed',
  undeliverable: 'Undeliverable',
  unsubscribed: 'Unsubscribed',
  draft: 'Draft',
};

export function formatStatus(status) {
  if (!status) return 'Sent';
  const key = String(status).toLowerCase();
  return LABELS[key] || key.replace(/_/g, ' ');
}

export function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function segments(text) {
  const message = String(text || '');
  if (!message) return 0;
  return message.length <= 160 ? 1 : Math.ceil(message.length / 153);
}
