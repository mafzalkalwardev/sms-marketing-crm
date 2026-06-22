import { useState } from 'react';
import { api } from '../api/client';
import useAsync from '../hooks/useAsync';
import Topbar from '../components/Topbar';
import Button from '../components/Button';

export default function AdminConsole() {
  const providers = useAsync(() => api('/api/admin/providers/status'), []);
  const [testForm, setTestForm] = useState({ to: '', message: 'SignalMint Vonage live test' });
  const [notice, setNotice] = useState('');
  const vonage = providers.data?.vonage;

  const testProvider = async () => {
    setNotice('');
    try {
      const result = await api('/api/admin/providers/vonage/test', { method: 'POST' });
      setNotice(`Provider check: ${result.status}. Mode: ${result.mode}.`);
      providers.refresh();
    } catch (error) {
      setNotice(error.message);
    }
  };

  const sendLiveTest = async (event) => {
    event.preventDefault();
    setNotice('');
    try {
      const result = await api('/api/admin/providers/vonage/test-sms', { method: 'POST', body: testForm });
      setNotice(result.mode === 'live'
        ? `Live test sent. Provider message ID: ${result.providerMessageId || 'pending'}`
        : `Test completed in ${result.mode} mode.`);
    } catch (error) {
      setNotice(error.message);
    }
  };

  return (
    <>
      <Topbar title="Admin Console" subtitle="Provider status, users, usage, and audit controls" />
      <section className="two-column">
        <article className="panel stack">
          <div className="provider-heading">
            <div>
              <h3>Vonage</h3>
              <span className={`badge ${vonage?.configured ? 'active' : 'warning'}`}>{vonage?.status || 'checking'}</span>
            </div>
            <span className={`badge ${vonage?.mode === 'live' ? 'active' : 'warning'}`}>{vonage?.mode || 'mock'}</span>
          </div>
          <div className="settings-grid">
            <span>API key</span><strong>{vonage?.apiKeyMasked || 'not configured'}</strong>
            <span>Default sender</span><strong>{vonage?.defaultSenderMasked || 'not configured'}</strong>
            <span>Signature secret</span><strong>{vonage?.signatureSecretConfigured ? 'configured' : 'missing'}</strong>
            <span>Signed verification</span><strong>{vonage?.signedWebhookVerificationActive ? 'active' : 'development fallback'}</strong>
          </div>
          <div className="code-box">
            POST {vonage?.webhookUrls?.inbound || '/webhooks/vonage/inbound'}<br />
            POST {vonage?.webhookUrls?.status || '/webhooks/vonage/status'}
          </div>
          <Button variant="ghost" onClick={testProvider}>Test provider</Button>
        </article>
        <form className="panel stack" onSubmit={sendLiveTest}>
          <h3>Send live test SMS</h3>
          <label className="field"><span>Recipient</span><input value={testForm.to} onChange={(event) => setTestForm({ ...testForm, to: event.target.value })} placeholder="+15551234567" required /></label>
          <label className="field"><span>Message</span><textarea value={testForm.message} onChange={(event) => setTestForm({ ...testForm, message: event.target.value })} required /></label>
          <Button>Send test SMS</Button>
          {notice && <div className={notice.includes('sent') || notice.includes('Provider check') ? 'alert success' : 'alert'}>{notice}</div>}
        </form>
      </section>
      <section className="stat-grid admin-stats">
        <article className="stat-card"><span>Users</span><strong>Admin</strong><small>Managed through API</small></article>
        <article className="stat-card"><span>Subscriptions</span><strong>Active</strong><small>Plan limits enforced on send</small></article>
        <article className="stat-card"><span>Usage</span><strong>Tracked</strong><small>Outbound messages counted monthly</small></article>
        <article className="stat-card"><span>Audit logs</span><strong>Enabled</strong><small>Provider secrets stay server-side</small></article>
      </section>
    </>
  );
}
