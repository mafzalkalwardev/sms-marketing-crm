import { api } from '../api/client';
import useAsync from '../hooks/useAsync';
import Topbar from '../components/Topbar';
import StatCard from '../components/StatCard';
import EmptyState from '../components/EmptyState';

export default function Dashboard() {
  const { data, loading, error } = useAsync(() => api('/api/reports/dashboard'), []);
  const stats = [
    ['Total contacts', data?.totalContacts || 0],
    ['Opted in', data?.optedIn || 0],
    ['Unsubscribed', data?.unsubscribed || 0],
    ['Sent today', data?.sentToday || 0],
    ['Replies today', data?.repliesToday || 0],
    ['Failed', data?.failed || 0],
    ['Delivery rate', `${data?.deliveryRate || 0}%`],
    ['Reply rate', `${data?.replyRate || 0}%`],
  ];

  return (
    <>
      <Topbar title="Dashboard" subtitle="Workspace overview" />
      {error && <div className="alert error">{error}</div>}
      <section className="stat-grid">
        {stats.map(([label, value]) => <StatCard key={label} label={label} value={loading ? '...' : value} />)}
      </section>
      <section className="two-column">
        <article className="panel">
          <h3>Recent messages</h3>
          {!data?.recentMessages?.length && <EmptyState title="No messages yet" text="Send a mock SMS from the dialer to populate this feed." />}
          <div className="activity-list">
            {data?.recentMessages?.map((message) => (
              <div key={message.id}>
                <strong>{message.name || message.to_number || message.from_number}</strong>
                <span>{message.direction} · {message.status}</span>
                <p>{message.message_body}</p>
              </div>
            ))}
          </div>
        </article>
        <article className="panel">
          <h3>Recent campaigns</h3>
          {!data?.recentCampaigns?.length && <EmptyState title="No campaigns yet" text="Create a draft campaign to see it here." />}
          <div className="activity-list">
            {data?.recentCampaigns?.map((campaign) => (
              <div key={campaign.id}>
                <strong>{campaign.title}</strong>
                <span>{campaign.status} · {campaign.send_rate}/sec</span>
                <p>{campaign.message_template}</p>
              </div>
            ))}
          </div>
        </article>
      </section>
    </>
  );
}
