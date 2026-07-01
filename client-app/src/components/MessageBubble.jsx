import { useState } from 'react';
import { formatStatus, formatTime } from '../lib/formatStatus';
import MessageTimeline from './MessageTimeline';

export default function MessageBubble({ message }) {
  const side = message.direction === 'inbound' ? 'inbound' : 'outbound';
  const statusLabel = message.status === 'draft' ? 'Draft' : formatStatus(message.status);
  const [showTimeline, setShowTimeline] = useState(false);
  const canShowTimeline = side === 'outbound' && message.id;

  return (
    <div className={`message-row ${side}`}>
      <div className="bubble">
        <p>{message.message_body}</p>
        <small>
          {canShowTimeline ? (
            <button
              type="button"
              className="status-link"
              onClick={() => setShowTimeline((open) => !open)}
              title="View delivery timeline"
            >
              {statusLabel} · {formatTime(message.created_at) || 'Now'}
              {showTimeline ? ' ▴' : ' ▾'}
            </button>
          ) : (
            <>{statusLabel} · {formatTime(message.created_at) || 'Now'}</>
          )}
        </small>
        {showTimeline && canShowTimeline && <MessageTimeline messageId={message.id} />}
      </div>
    </div>
  );
}
