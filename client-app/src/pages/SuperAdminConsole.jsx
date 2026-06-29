import { useState } from 'react';
import { api } from '../api/client';
import useAsync from '../hooks/useAsync';
import Topbar from '../components/Topbar';
import Button from '../components/Button';

export default function SuperAdminConsole() {
  const providers = useAsync(() => api('/api/super/providers/status'), []);
  const users = useAsync(() => api('/api/super/users'), []);
  const [testForm, setTestForm] = useState({ to: '', message: 'SignalMint test SMS' });
  const [notice, setNotice] = useState('');
  const vonage = providers.data?.vonage;

  const testProvider = async () => {
    setNotice('');
    try {
      const result = await api('/api/super/providers/vonage/test', { method: 'POST' });
      setNotice(`Backend check: ${result.status}. Mode: ${result.mode}.`);
      providers.refresh();
    } catch (error) {
      setNotice(error.message);
    }
  };

  const sendTest = async (event) => {
    event.preventDefault();
    setNotice('');
    try {
      await api('/api/super/providers/vonage/test-sms', { method: 'POST', body: testForm });
      setNotice('Test message queued.');
    } catch (error) {
      setNotice(error.message);
    }
  };

  const suspendUser = async (user) => {
    await api(`/api/super/users/${user.id}/status`, {
      method: 'PUT',
      body: { status: user.status === 'suspended' ? 'active' : 'suspended', reason: 'Super admin action' },
    });
    users.refresh();
  };

  return (
    <>
      <Topbar title="Super Admin" subtitle="Provider backends, user suspension, platform health" />
      <section className="two-column">
        <article className="panel stack">
          <div className="provider-heading">
            <div>
              <h3>Primary SMS backend</h3>
              <span className={`badge ${vonage?.configured ? 'active' : 'warning'}`}>{vonage?.status || 'checking'}</span>
            </div>
            <span className={`badge ${vonage?.mode === 'live' ? 'active' : 'warning'}`}>{vonage?.mode || 'mock'}</span>
          </div>
          <div className="settings-grid">
            <span>API key</span><strong>{vonage?.apiKeyMasked || 'not configured'}</strong>
            <span>Default sender</span><strong>{vonage?.defaultSenderMasked || 'not configured'}</strong>
            <span>Webhook signing</span><strong>{vonage?.signatureSecretConfigured ? 'configured' : 'missing'}</strong>
          </div>
          <div className="code-box">
            POST {vonage?.webhookUrls?.inbound || '/webhooks/vonage/inbound'}<br />
            POST {vonage?.webhookUrls?.status || '/webhooks/vonage/status'}<br />
            POST /webhooks/twilio/inbound · /status
          </div>
          <Button variant="ghost" onClick={testProvider}>Test backend</Button>
        </article>
        <form className="panel stack" onSubmit={sendTest}>
          <h3>Send test SMS</h3>
          <label className="field"><span>Recipient</span><input value={testForm.to} onChange={(e) => setTestForm({ ...testForm, to: e.target.value })} placeholder="+15551234567" required /></label>
          <label className="field"><span>Message</span><textarea value={testForm.message} onChange={(e) => setTestForm({ ...testForm, message: e.target.value })} required /></label>
          <Button>Send test</Button>
          {notice && <div className="alert success">{notice}</div>}
        </form>
      </section>
      <section className="panel">
        <h3>Platform users</h3>
        {!users.data?.length && <p>Loading users…</p>}
        {Boolean(users.data?.length) && (
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {users.data.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>{u.role}</td>
                  <td><span className={`badge ${u.status}`}>{u.status}</span></td>
                  <td>
                    {u.role !== 'super_admin' && (
                      <Button variant="ghost" onClick={() => suspendUser(u)}>
                        {u.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
