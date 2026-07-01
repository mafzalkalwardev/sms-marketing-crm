import { useState } from 'react';
import { api, API_BASE } from '../api/client';
import useAsync from '../hooks/useAsync';
import Topbar from '../components/Topbar';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';

export default function Compliance() {
  const summary = useAsync(() => api('/api/compliance/summary'), []);
  const suppressions = useAsync(() => api('/api/compliance/suppressions?limit=100'), []);
  const [exporting, setExporting] = useState(false);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/api/compliance/suppressions/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'signalmint-suppressions.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      alert(error.message);
    } finally {
      setExporting(false);
    }
  };

  const keywords = summary.data?.stopKeywords || ['STOP', 'UNSUBSCRIBE', 'REMOVE'];

  return (
    <>
      <Topbar
        title="Compliance"
        subtitle="Opt-outs, suppression list, and sending rules"
        action={<Button variant="ghost" disabled={exporting} onClick={exportCsv}>Export CSV</Button>}
      />

      <section className="stat-grid">
        <article className="stat-card"><span>Suppressed numbers</span><strong>{summary.data?.suppressedNumbers ?? '—'}</strong></article>
        <article className="stat-card"><span>Unsubscribed contacts</span><strong>{summary.data?.unsubscribedContacts ?? '—'}</strong></article>
        <article className="stat-card"><span>Opted in</span><strong>{summary.data?.optedInContacts ?? '—'}</strong></article>
        <article className="stat-card"><span>STOP messages</span><strong>{summary.data?.inboundStopMessages ?? '—'}</strong></article>
      </section>

      <section className="two-column">
        <article className="panel">
          <h3>How it works</h3>
          <div className="check-list">
            <span>Send only to opted-in contacts.</span>
            <span>Include opt-out language in marketing texts.</span>
            <span>STOP replies auto-unsubscribe the contact and add them to suppression.</span>
            <span>Future sends to suppressed numbers are blocked.</span>
            <span>Campaign previews exclude suppressed contacts.</span>
          </div>
        </article>
        <article className="panel">
          <h3>Opt-out keywords</h3>
          <div className="keyword-grid">{keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div>
          <h3>Regional notes</h3>
          <p className="muted-copy">US A2P 10DLC and UK sender-ID rules may apply depending on your use case. Your platform operator configures dialer backends.</p>
        </article>
      </section>

      <section className="panel">
        <h3>Suppression list</h3>
        {!suppressions.data?.length && (
          <EmptyState title="No suppressions yet" text="When someone replies STOP, they appear here automatically." />
        )}
        {Boolean(suppressions.data?.length) && (
          <table>
            <thead>
              <tr><th>Phone</th><th>Reason</th><th>Source</th><th>When</th></tr>
            </thead>
            <tbody>
              {suppressions.data.map((row) => (
                <tr key={row.id}>
                  <td>{row.phone}</td>
                  <td>{row.reason || '—'}</td>
                  <td>{row.source || '—'}</td>
                  <td>{new Date(row.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
