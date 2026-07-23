import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import useAsync from '../hooks/useAsync';
import Topbar from '../components/Topbar';
import Button from '../components/Button';
import Input from '../components/Input';
import EmptyState from '../components/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input as ShadInput } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
const ACTIVE_STATUSES = new Set(['queued', 'sending', 'paused']);

function campaignBadgeVariant(status) {
  if (status === 'completed') return 'success';
  if (status === 'cancelled' || status === 'failed') return 'destructive';
  if (status === 'paused') return 'warning';
  if (status === 'queued' || status === 'sending') return 'default';
  return 'outline';
}

export default function Campaigns() {
  const campaigns = useAsync(() => api('/api/campaigns'), []);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [details, setDetails] = useState({});

  const activeIds = useMemo(
    () => (campaigns.data || []).filter((c) => ACTIVE_STATUSES.has(c.status)).map((c) => c.id),
    [campaigns.data]
  );

  useEffect(() => {
    if (!activeIds.length) return undefined;

    let cancelled = false;
    const poll = async () => {
      const next = {};
      await Promise.all(activeIds.map(async (id) => {
        try {
          next[id] = await api(`/api/campaigns/${id}`);
        } catch {
          /* ignore poll errors */
        }
      }));
      if (!cancelled) setDetails((prev) => ({ ...prev, ...next }));
    };

    poll();
    const timer = setInterval(poll, 2500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeIds.join(',')]);

  const create = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const body = Object.fromEntries(new FormData(formElement).entries());
    body.send_rate = Number(body.send_rate) || 1;
    try {
      await api('/api/campaigns', { method: 'POST', body });
      formElement.reset();
      campaigns.refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const act = async (campaign, action) => {
    setError('');
    try {
      const result = await api(`/api/campaigns/${campaign.id}/${action}`, { method: 'POST' });
      if (action === 'preview') setPreview(result);
      if (action === 'send' && result.status === 'queued') {
        setPreview({ recipients: 'Queued', excluded: 0, estimatedCost: '—', note: 'Campaign is sending in the background.' });
      }
      campaigns.refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const renderProgress = (campaign) => {
    const detail = details[campaign.id];
    const progress = detail?.progress;
    if (!progress || !ACTIVE_STATUSES.has(campaign.status)) return null;

    return (
      <div className="space-y-1.5">
        <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
          <span
            className="block h-full rounded-full bg-primary transition-all"
            style={{ width: `${progress.percent || 0}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {progress.percent || 0}% · sent {progress.sent || 0} · failed {progress.failed || 0}
          {progress.pending ? ` · pending ${progress.pending}` : ''}
          {detail?.deadLetters?.length ? ` · dead letters ${detail.deadLetters.length}` : ''}
        </p>
      </div>
    );
  };

  return (
    <div className="space-y-4 pb-20 md:pb-6">
      <Topbar title="Campaigns" subtitle="Broadcast with queue-backed fan-out" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Create campaign</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={create}>
              <Input label="Campaign title" name="title" required placeholder="June winback" />
              <Input label="Message template">
                <Textarea
                  name="message_template"
                  required
                  placeholder="Hi {{name}}, reply YES for details. Reply STOP to opt out."
                />
              </Input>
              <Input label="Send rate (per sec)">
                <ShadInput name="send_rate" type="number" min="1" defaultValue="5" />
              </Input>
              {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
              <Button>Save draft</Button>
              {preview && (
                <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm">
                  {preview.note || `Recipients: ${preview.recipients} · Excluded: ${preview.excluded} · Est. $${preview.estimatedCost}`}
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Campaign list</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!campaigns.data?.length && (
              <EmptyState title="No campaigns yet" text="Create a draft, preview recipients, then queue it safely." />
            )}
            {campaigns.data?.map((campaign) => (
              <article key={campaign.id} className="space-y-3 rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm">{campaign.title}</strong>
                  <Badge variant={campaignBadgeVariant(campaign.status)}>{campaign.status}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{campaign.message_template}</p>
                <p className="text-xs text-muted-foreground">{campaign.send_rate || 1}/sec</p>
                {renderProgress(campaign)}
                <div className="flex flex-wrap gap-1">
                  <Button variant="ghost" size="sm" onClick={() => act(campaign, 'preview')}>Preview</Button>
                  <Button size="sm" onClick={() => act(campaign, 'send')}>Queue send</Button>
                  {campaign.status === 'paused' && (
                    <Button variant="ghost" size="sm" onClick={() => act(campaign, 'resume')}>Resume</Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => act(campaign, 'pause')}>Pause</Button>
                  {(details[campaign.id]?.progress?.failed > 0 || details[campaign.id]?.deadLetters?.length > 0) && (
                    <Button variant="ghost" size="sm" onClick={() => act(campaign, 'retry-failed')}>Retry failed</Button>
                  )}
                  <Button variant="danger" size="sm" onClick={() => act(campaign, 'cancel')}>Cancel</Button>
                </div>
              </article>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
