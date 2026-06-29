import { useMemo, useState } from 'react';
import { api } from '../api/client';
import useAsync from '../hooks/useAsync';
import Topbar from '../components/Topbar';
import Button from '../components/Button';
import Input from '../components/Input';

const EMPTY_FORM = {
  provider: 'vonage',
  label: '',
  api_key: '',
  api_secret: '',
  account_sid: '',
  base_url: '',
};

export default function SuperAdminConsole() {
  const status = useAsync(() => api('/api/super/providers/status'), []);
  const catalog = useAsync(() => api('/api/super/providers/catalog'), []);
  const providers = useAsync(() => api('/api/super/providers'), []);
  const users = useAsync(() => api('/api/super/users'), []);
  const [form, setForm] = useState(EMPTY_FORM);
  const [testForm, setTestForm] = useState({ to: '', message: 'SignalMint test SMS' });
  const [notice, setNotice] = useState('');

  const platform = status.data?.platform;
  const selectedCatalog = useMemo(
    () => catalog.data?.catalog?.find((entry) => entry.id === form.provider),
    [catalog.data, form.provider]
  );
  const isBrowser = selectedCatalog?.lane === 'browser';

  const addProvider = async (event) => {
    event.preventDefault();
    setNotice('');
    try {
      await api('/api/super/providers', {
        method: 'POST',
        body: {
          provider: form.provider,
          label: form.label || selectedCatalog?.label,
          api_key: form.api_key,
          api_secret: form.api_secret,
          account_sid: form.account_sid,
          base_url: form.base_url,
          adapter_type: selectedCatalog?.lane,
        },
      });
      setForm(EMPTY_FORM);
      setNotice('Dialer backend added.');
      providers.refresh();
      status.refresh();
    } catch (error) {
      setNotice(error.message);
    }
  };

  const setDefault = async (id) => {
    await api(`/api/super/providers/${id}/set-default`, { method: 'POST' });
    providers.refresh();
  };

  const sendTest = async (event) => {
    event.preventDefault();
    setNotice('');
    try {
      const result = await api('/api/super/providers/vonage/test-sms', { method: 'POST', body: testForm });
      setNotice(result.ok ? `Test message ${result.status || 'queued'}.` : (result.error || 'Test failed'));
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
      <Topbar title="Super Admin" subtitle="Dialer backends, delivery mode, and platform users" />

      <section className="panel platform-banner">
        <div>
          <p className="eyebrow">Delivery mode</p>
          <h3>{platform?.deliveryMode === 'live' ? 'Live SMS enabled' : 'Sandbox mode'}</h3>
          <p>{platform?.sandboxReason || 'Checking platform status...'}</p>
        </div>
        <span className={`badge ${platform?.deliveryMode === 'live' ? 'active' : 'warning'}`}>
          {platform?.deliveryMode || 'checking'}
        </span>
      </section>

      <section className="two-column">
        <form className="panel stack" onSubmit={addProvider}>
          <h3>Add dialer backend</h3>
          <label className="field">
            <span>Dialer type</span>
            <select value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}>
              {catalog.data?.catalog?.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label} ({entry.lane === 'browser' ? 'Browser' : 'API'})
                </option>
              ))}
            </select>
          </label>
          <Input label="Label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Primary sales line" />
          {isBrowser ? (
            <Input label="Portal URL" value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} placeholder="https://voice.google.com" required />
          ) : (
            <>
              {form.provider === 'twilio' && (
                <Input label="Account SID" value={form.account_sid} onChange={(e) => setForm({ ...form, account_sid: e.target.value })} required />
              )}
              <Input label={form.provider === 'twilio' ? 'Auth token' : 'API key'} value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} required />
              {form.provider !== 'telnyx' && (
                <Input label="API secret" type="password" value={form.api_secret} onChange={(e) => setForm({ ...form, api_secret: e.target.value })} required />
              )}
            </>
          )}
          <Button>Add backend</Button>
        </form>

        <form className="panel stack" onSubmit={sendTest}>
          <h3>Send live test SMS</h3>
          <p className="muted-copy">Uses the active backend. In sandbox mode, messages are simulated only.</p>
          <Input label="Recipient" value={testForm.to} onChange={(e) => setTestForm({ ...testForm, to: e.target.value })} placeholder="+15551234567" required />
          <label className="field">
            <span>Message</span>
            <textarea value={testForm.message} onChange={(e) => setTestForm({ ...testForm, message: e.target.value })} required />
          </label>
          <Button>Send test</Button>
        </form>
      </section>

      <section className="panel">
        <h3>Configured dialer backends</h3>
        {!providers.data?.providers?.length && <p>No backends configured yet. Add Vonage, Twilio, or a browser dialer above.</p>}
        {Boolean(providers.data?.providers?.length) && (
          <table>
            <thead>
              <tr><th>Label</th><th>Type</th><th>Lane</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {providers.data.providers.map((row) => (
                <tr key={row.id}>
                  <td>{row.label || row.provider}</td>
                  <td>{row.catalog?.label || row.provider}</td>
                  <td><span className="badge">{row.adapter_type || row.catalog?.lane || 'api'}</span></td>
                  <td><span className={`badge ${row.status}`}>{row.is_default ? 'default' : row.status}</span></td>
                  <td className="row-actions">
                    {!row.is_default && <Button variant="ghost" onClick={() => setDefault(row.id)}>Set default</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="code-box">
          Webhooks: POST /webhooks/vonage/inbound · /status · /webhooks/twilio/inbound · /status
        </div>
      </section>

      {notice && <div className="alert success">{notice}</div>}

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
