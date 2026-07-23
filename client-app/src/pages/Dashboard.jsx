import { api } from '../api/client';
import useAsync from '../hooks/useAsync';
import Topbar from '../components/Topbar';
import StatCard from '../components/StatCard';
import EmptyState from '../components/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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
    <div className="space-y-6 pb-20 md:pb-6">
      <Topbar title="Dashboard" subtitle="Workspace overview" />
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(([label, value]) => (
          <StatCard key={label} label={label} value={loading ? '...' : value} />
        ))}
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent messages</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!data?.recentMessages?.length && (
              <EmptyState title="No messages yet" description="Send an SMS from the dialer to populate this feed." />
            )}
            {data?.recentMessages?.map((message) => (
              <div key={message.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-sm">{message.name || message.to_number || message.from_number}</strong>
                  <Badge variant="secondary">{message.direction} · {message.status}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{message.message_body}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent campaigns</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!data?.recentCampaigns?.length && (
              <EmptyState title="No campaigns yet" description="Create a draft campaign to see it here." />
            )}
            {data?.recentCampaigns?.map((campaign) => (
              <div key={campaign.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-sm">{campaign.title}</strong>
                  <Badge variant="outline">{campaign.status} · {campaign.send_rate}/sec</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{campaign.message_template}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
