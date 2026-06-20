import { useState } from 'react';
import { api } from '../api/client';
import useAsync from '../hooks/useAsync';
import Topbar from '../components/Topbar';
import Button from '../components/Button';
import Input from '../components/Input';
import EmptyState from '../components/EmptyState';

export default function Campaigns() {
  const campaigns = useAsync(() => api('/api/campaigns'), []);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');

  const create = async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    body.send_rate = Number(body.send_rate) || 1;
    try {
      await api('/api/campaigns', { method: 'POST', body });
      event.currentTarget.reset();
      campaigns.refresh();
    } catch (error) {
      setError(error.message);
    }
  };

  const act = async (campaign, action) => {
    const result = await api(`/api/campaigns/${campaign.id}/${action}`, { method: 'POST' });
    if (action === 'preview') setPreview(result);
    campaigns.refresh();
  };

  return (
    <>
      <Topbar title="Campaigns" subtitle="Safe campaign planner" />
      <section className="split-layout">
        <form className="panel stack" onSubmit={create}>
          <h3>Create campaign</h3>
          <Input label="Campaign title" name="title" required placeholder="June winback" />
          <Input label="Message template"><textarea name="message_template" required placeholder="Hi {{name}}, reply YES for details. Reply STOP to opt out." /></Input>
          <Input label="Send rate"><input name="send_rate" type="number" min="1" defaultValue="1" /></Input>
          {error && <div className="alert error">{error}</div>}
          <Button>Save draft</Button>
          {preview && <div className="alert">Recipients: {preview.recipients} · Excluded: {preview.excluded} · Est. ${preview.estimatedCost}</div>}
        </form>
        <section className="panel">
          <h3>Campaign list</h3>
          {!campaigns.data?.length && <EmptyState title="No campaigns yet" text="Create a draft, preview recipients, then queue it safely." />}
          <div className="campaign-list">
            {campaigns.data?.map((campaign) => (
              <article key={campaign.id} className="campaign-card">
                <div><strong>{campaign.title}</strong><span className={`badge ${campaign.status}`}>{campaign.status}</span></div>
                <p>{campaign.message_template}</p>
                <small>{campaign.send_rate}/sec</small>
                <div className="row-actions"><Button variant="ghost" onClick={() => act(campaign, 'preview')}>Preview</Button><Button onClick={() => act(campaign, 'send')}>Send mock</Button><Button variant="ghost" onClick={() => act(campaign, 'pause')}>Pause</Button><Button variant="danger" onClick={() => act(campaign, 'cancel')}>Cancel</Button></div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </>
  );
}
