import { useState } from 'react';
import { formatStatus, formatTime } from '../lib/formatStatus';
import MessageTimeline from './MessageTimeline';
import { cn } from '@/lib/utils';

export default function MessageBubble({ message }) {
  const side = message.direction === 'inbound' ? 'inbound' : 'outbound';
  const statusLabel = message.status === 'draft' ? 'Draft' : formatStatus(message.status);
  const [showTimeline, setShowTimeline] = useState(false);
  const canShowTimeline = side === 'outbound' && message.id;

  return (
    <div className={cn('flex', side === 'outbound' ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm',
          side === 'outbound'
            ? 'rounded-br-md bg-primary text-primary-foreground'
            : 'rounded-bl-md border bg-card'
        )}
      >
        <p className="whitespace-pre-wrap">{message.message_body}</p>
        <small className={cn('mt-1 block text-[11px]', side === 'outbound' ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
          {canShowTimeline ? (
            <button type="button" className="underline-offset-2 hover:underline" onClick={() => setShowTimeline((open) => !open)}>
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
