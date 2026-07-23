import { api } from '../api/client';
import useAsync from '../hooks/useAsync';
import { formatStatus, formatTime } from '../lib/formatStatus';
import { cn } from '@/lib/utils';

export default function MessageTimeline({ messageId }) {
  const { data, loading, error } = useAsync(
    () => api(`/api/messages/${messageId}/timeline`),
    [messageId]
  );

  if (loading) {
    return (
      <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
        Loading delivery status…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {error.message}
      </div>
    );
  }

  if (!data?.timeline?.length) return null;

  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Delivery status
      </p>
      <ol className="space-y-3">
        {data.timeline.map((event, index) => (
          <li key={`${event.at}-${index}`} className="flex gap-3">
            <span
              className={cn(
                'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-primary',
                event.to === 'Failed' && 'bg-destructive'
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm">
                <strong>{event.to}</strong>
                {event.from && <span className="text-muted-foreground"> from {event.from}</span>}
              </div>
              <small className="text-xs text-muted-foreground">{formatTime(event.at)}</small>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 border-t pt-2 text-xs text-muted-foreground">
        Current: {formatStatus(data.currentStatus)}
      </p>
    </div>
  );
}
