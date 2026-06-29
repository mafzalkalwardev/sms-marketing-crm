import { formatStatus, formatTime } from '../lib/formatStatus';

export default function MessageBubble({ message }) {
  const side = message.direction === 'inbound' ? 'inbound' : 'outbound';
  const statusLabel = message.status === 'draft' ? 'Draft' : formatStatus(message.status);
  return (
    <div className={`message-row ${side}`}>
      <div className="bubble">
        <p>{message.message_body}</p>
        <small>{statusLabel} · {formatTime(message.created_at) || 'Now'}</small>
      </div>
    </div>
  );
}
