import { api } from '../api/client';
import useAsync from '../hooks/useAsync';
import { formatStatus, formatTime } from '../lib/formatStatus';

export default function MessageTimeline({ messageId }) {
  const { data, loading, error } = useAsync(
    () => api(`/api/messages/${messageId}/timeline`),
    [messageId]
  );

  if (loading) return <div className="message-timeline loading">Loading delivery status…</div>;
  if (error) return <div className="message-timeline error">{error.message}</div>;
  if (!data?.timeline?.length) return null;

  return (
    <div className="message-timeline">
      <p className="message-timeline-title">Delivery status</p>
      <ol>
        {data.timeline.map((event, index) => (
          <li key={`${event.at}-${index}`}>
            <span className={`timeline-dot ${event.to === 'Failed' ? 'failed' : ''}`} />
            <div>
              <strong>{event.to}</strong>
              {event.from && <span className="muted-copy"> from {event.from}</span>}
              <small>{formatTime(event.at)}</small>
            </div>
          </li>
        ))}
      </ol>
      <p className="muted-copy">Current: {formatStatus(data.currentStatus)}</p>
    </div>
  );
}
