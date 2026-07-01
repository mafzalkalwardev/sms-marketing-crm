import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import useAsync from '../hooks/useAsync';
import Topbar from '../components/Topbar';
import Button from '../components/Button';
import Input from '../components/Input';
import EmptyState from '../components/EmptyState';

const ACTIVE_STATUSES = new Set(['queued', 'sending', 'paused']);

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
      <div className="campaign-progress">
        <div className="progress-bar" aria-hidden>
          <span style={{ width: `${progress.percent || 0}%` }} />
        </div>
        <small>
          {progress.percent || 0}% · sent {progress.sent || 0} · failed {progress.failed || 0}
          {progress.pending ? ` · pending ${progress.pending}` : ''}
          {detail?.deadLetters?.length ? ` · dead letters ${detail.deadLetters.length}` : ''}
        </small>
      </div>
    );
  };

  return (
    <>
      <Topbar title="Campaigns" subtitle="Broadcast with queue-backed fan-out" />
      <section className="split-layout">
        <form className="panel stack" onSubmit={create}>
          <h3>Create campaign</h3>
          <Input label="Campaign title" name="title" required placeholder="June winback" />
          <Input label="Message template"><textarea name="message_template" required placeholder="Hi {{name}}, reply YES for details. Reply STOP to opt out." /></Input>
          <Input label="Send rate (per sec)"><input name="send_rate" type="number" min="1" defaultValue="5" /></Input>
          {error && <div className="alert error">{error}</div>}
          <Button>Save draft</Button>
          {preview && (
            <div className="alert">
              {preview.note || `Recipients: ${preview.recipients} · Excluded: ${preview.excluded} · Est. $${preview.estimatedCost}`}
            </div>
          )}
        </form>
        <section className="panel">
          <h3>Campaign list</h3>
          {!campaigns.data?.length && <EmptyState title="No campaigns yet" text="Create a draft, preview recipients, then queue it safely." />}
          <div className="campaign-list">
            {campaigns.data?.map((campaign) => (
              <article key={campaign.id} className="campaign-card">
                <div><strong>{campaign.title}</strong><span className={`badge ${campaign.status}`}>{campaign.status}</span></div>
                <p>{campaign.message_template}</p>
                <small>{campaign.send_rate || 1}/sec</small>
                {renderProgress(campaign)}
                <div className="row-actions">
                  <Button variant="ghost" onClick={() => act(campaign, 'preview')}>Preview</Button>
                  <Button onClick={() => act(campaign, 'send')}>Queue send</Button>
                  {campaign.status === 'paused' && <Button variant="ghost" onClick={() => act(campaign, 'resume')}>Resume</Button>}
                  <Button variant="ghost" onClick={() => act(campaign, 'pause')}>Pause</Button>
                  {(details[campaign.id]?.progress?.failed > 0 || details[campaign.id]?.deadLetters?.length > 0) && (
                    <Button variant="ghost" onClick={() => act(campaign, 'retry-failed')}>Retry failed</Button>
                  )}
                  <Button variant="danger" onClick={() => act(campaign, 'cancel')}>Cancel</Button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </>
  );
}
