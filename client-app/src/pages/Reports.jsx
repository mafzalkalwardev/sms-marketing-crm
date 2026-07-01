import { useMemo, useState } from 'react';
import { api } from '../api/client';
import useAsync from '../hooks/useAsync';
import Topbar from '../components/Topbar';
import StatCard from '../components/StatCard';
import Button from '../components/Button';
import { formatStatus } from '../lib/formatStatus';

function defaultFromDate() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

export default function Reports() {
  const [from, setFrom] = useState(defaultFromDate());
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [direction, setDirection] = useState('all');

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (from) params.set('from', `${from}T00:00:00.000Z`);
    if (to) params.set('to', `${to}T23:59:59.999Z`);
    return params.toString();
  }, [from, to]);

  const dashboard = useAsync(() => api(`/api/reports/dashboard?${query}`), [query]);
  const messages = useAsync(
    () => api(`/api/reports/messages?${query}&direction=${direction}&limit=50`),
    [query, direction]
  );

  const refresh = () => {
    dashboard.refresh();
    messages.refresh();
  };

  return (
    <>
      <Topbar title="Reports" subtitle="Delivery, replies, and estimated cost" />
      {dashboard.error && <div className="alert error">{dashboard.error}</div>}

      <section className="panel stack">
        <h3>Date range</h3>
        <div className="filters reports-filters">
          <label className="field">
            <span>From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field">
            <span>To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="field">
            <span>Direction</span>
            <select value={direction} onChange={(e) => setDirection(e.target.value)}>
              <option value="all">All</option>
              <option value="outbound">Outbound</option>
              <option value="inbound">Inbound</option>
            </select>
          </label>
          <Button onClick={refresh}>Apply</Button>
        </div>
      </section>

      <section className="stat-grid">
        <StatCard label="Outbound" value={dashboard.data?.outbound ?? '…'} />
        <StatCard label="Delivered" value={dashboard.data?.delivered ?? '…'} />
        <StatCard label="Delivery rate" value={`${dashboard.data?.deliveryRate || 0}%`} />
        <StatCard label="Reply rate" value={`${dashboard.data?.replyRate || 0}%`} />
        <StatCard label="Failed" value={dashboard.data?.failed ?? '…'} />
        <StatCard label="Est. cost" value={`$${dashboard.data?.totalCost ?? 0}`} />
        <StatCard label="Mode" value={dashboard.data?.providerMode || 'sandbox'} />
      </section>

      <section className="panel">
        <h3>Message log</h3>
        {!messages.data?.length && <p className="muted-copy">No messages in this range.</p>}
        {Boolean(messages.data?.length) && (
          <table>
            <thead>
              <tr><th>When</th><th>Contact</th><th>Direction</th><th>Status</th><th>Body</th><th>Cost</th></tr>
            </thead>
            <tbody>
              {messages.data.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.created_at).toLocaleString()}</td>
                  <td>{row.contact_name || row.to_number || row.from_number}</td>
                  <td>{row.direction}</td>
                  <td>{formatStatus(row.status)}</td>
                  <td className="truncate">{row.message_body}</td>
                  <td>{row.cost_estimate != null ? `$${Number(row.cost_estimate).toFixed(4)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
