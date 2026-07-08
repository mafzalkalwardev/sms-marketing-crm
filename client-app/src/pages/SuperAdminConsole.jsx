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
  warmup_to: '',
  send_warmup: true,
};

export default function SuperAdminConsole() {
  const status = useAsync(() => api('/api/super/providers/status'), []);
  const catalog = useAsync(() => api('/api/super/providers/catalog'), []);
  const providers = useAsync(() => api('/api/super/providers'), []);
  const users = useAsync(() => api('/api/super/users'), []);
  const pendingApprovals = useAsync(() => api('/api/super/users/pending-approvals'), []);
  const organizations = useAsync(() => api('/api/super/organizations'), []);
  const browserProfiles = useAsync(() => api('/api/super/browser-profiles'), []);
  const healthDetail = useAsync(() => api('/api/super/health/detail'), []);
  const webhookLogs = useAsync(() => api('/api/super/webhook-logs?limit=25'), []);
  const deadLetters = useAsync(() => api('/api/super/webhook-dead-letters?limit=25'), []);
  const platformAudit = useAsync(() => api('/api/super/audit?limit=25'), []);
  const [form, setForm] = useState(EMPTY_FORM);
  const [testForm, setTestForm] = useState({ providerId: '', to: '', message: 'SignalMint test SMS' });
  const [notice, setNotice] = useState('');
  const [connectionById, setConnectionById] = useState({});

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
      const result = await api('/api/super/providers', {
        method: 'POST',
        body: {
          provider: form.provider,
          label: form.label || selectedCatalog?.label,
          api_key: form.api_key,
          api_secret: form.api_secret,
          account_sid: form.account_sid,
          base_url: form.base_url,
          adapter_type: selectedCatalog?.lane,
          warmup_to: form.warmup_to || undefined,
          send_warmup: form.send_warmup && Boolean(form.warmup_to),
        },
      });
      setForm(EMPTY_FORM);
      const connectionNote = result.connection?.ok
        ? `Connection verified (${result.connection.mode || 'ok'}).`
        : `Connection issue: ${result.connection?.error || 'unknown'}.`;
      const warmupNote = result.warmup
        ? (result.warmup.ok !== false
          ? ` Warm-up sent (${result.warmup.status || 'queued'}).`
          : ` Warm-up failed: ${result.warmup.error || 'unknown'}.`)
        : '';
      setNotice(`Dialer backend added. ${connectionNote}${warmupNote}`);
      providers.refresh();
      status.refresh();
    } catch (error) {
      setNotice(error.message);
    }
  };

  const testConnection = async (id) => {
    setNotice('');
    try {
      const result = await api(`/api/super/providers/${id}/test`, { method: 'POST' });
      setConnectionById((prev) => ({ ...prev, [id]: result }));
      setNotice(
        result.ok
          ? `Connection OK (${result.mode || 'live'}${result.note ? ` — ${result.note}` : ''}).`
          : `Connection failed: ${result.error || 'unknown error'}.`
      );
    } catch (error) {
      setNotice(error.message);
    }
  };

  const browserLogin = async (profileId) => {
    setNotice('');
    try {
      const result = await api(`/api/super/browser-profiles/${profileId}/login`, { method: 'POST' });
      setNotice(`Browser session: ${result.sessionStatus || 'started'}${result.note ? ` — ${result.note}` : ''}`);
      browserProfiles.refresh();
    } catch (error) {
      setNotice(error.message);
    }
  };

  const browserSession = async (profileId) => {
    setNotice('');
    try {
      const result = await api(`/api/super/browser-profiles/${profileId}/session`);
      setNotice(`Session: ${result.sessionStatus || 'unknown'}${result.detail ? ` — ${result.detail}` : ''}`);
      browserProfiles.refresh();
    } catch (error) {
      setNotice(error.message);
    }
  };

  const migrateSelectors = async (profileId) => {
    setNotice('');
    try {
      const result = await api(`/api/super/browser-profiles/${profileId}/migrate-selectors`, {
        method: 'POST',
        body: { targetVersion: 'v2' },
      });
      setNotice(`Selectors migrated to ${result.profile?.selector_version || 'v2'}`);
      browserProfiles.refresh();
    } catch (error) {
      setNotice(error.message);
    }
  };

  const browserPoll = async (profileId) => {
    setNotice('');
    try {
      const result = await api(`/api/super/browser-profiles/${profileId}/poll`, { method: 'POST' });
      const relogin = result.needsRelogin ? ' — re-login required' : '';
      setNotice(`Inbound poll: ${result.processedCount ?? 0} message(s) processed.${relogin}`);
      browserProfiles.refresh();
    } catch (error) {
      setNotice(error.message);
    }
  };

  const sendWarmup = async (id) => {
    if (!testForm.to) {
      setNotice('Enter a recipient number in the test SMS form first.');
      return;
    }
    setNotice('');
    try {
      const result = await api(`/api/super/providers/${id}/warmup`, {
        method: 'POST',
        body: { to: testForm.to, message: testForm.message },
      });
      setNotice(
        result.ok
          ? `Warm-up sent via backend #${id} (${result.warmup?.status || 'queued'}).`
          : `Warm-up failed: ${result.warmup?.error || result.error || 'unknown'}.`
      );
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
      const defaultProvider = providers.data?.providers?.find((p) => p.is_default)
        || providers.data?.providers?.[0];
      const providerId = testForm.providerId || defaultProvider?.id;
      if (!providerId) {
        setNotice('Add a dialer backend before sending a test message.');
        return;
      }
      const result = await api(`/api/super/providers/${providerId}/warmup`, {
        method: 'POST',
        body: { to: testForm.to, message: testForm.message },
      });
      setNotice(
        result.ok
          ? `Test message ${result.warmup?.status || 'queued'} (${result.warmup?.mode || platform?.deliveryMode || 'sandbox'}).`
          : (result.warmup?.error || result.error || 'Test failed')
      );
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

  const approveUser = async (user) => {
    const orgId = window.prompt('Organization ID (optional if invite code used):', user.organization_id || '');
    const adminId = window.prompt('Managing admin user ID (optional):', user.managed_by_admin_id || '');
    await api(`/api/super/users/${user.id}/approve`, {
      method: 'POST',
      body: {
        organization_id: orgId ? Number(orgId) : undefined,
        managed_by_admin_id: adminId ? Number(adminId) : undefined,
      },
    });
    setNotice(`Approved ${user.name}`);
    users.refresh();
    pendingApprovals.refresh();
  };

  const createAdmin = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api('/api/super/users', {
        method: 'POST',
        body: {
          name: form.get('name'),
          email: form.get('email'),
          password: form.get('password'),
          role: 'admin',
          org_name: form.get('org_name'),
        },
      });
      setNotice('Admin and organization created.');
      users.refresh();
      organizations.refresh();
      event.currentTarget.reset();
    } catch (error) {
      setNotice(error.message);
    }
  };

  const impersonateUser = async (user) => {
    const data = await api(`/api/super/users/${user.id}/impersonate`, { method: 'POST' });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify({ ...data.user, impersonated_by: data.impersonated_by }));
    window.location.reload();
  };

  const deleteUser = async (user) => {
    if (!window.confirm(`Deactivate ${user.name}?`)) return;
    await api(`/api/super/users/${user.id}`, { method: 'DELETE' });
    users.refresh();
    setNotice(`${user.name} deactivated.`);
  };

  const toggleOrgLive = async (org) => {
    const next = org.delivery_mode === 'live' ? 'sandbox' : 'live';
    await api(`/api/super/organizations/${org.id}`, {
      method: 'PUT',
      body: { delivery_mode: next },
    });
    organizations.refresh();
    setNotice(`Org ${org.name} set to ${next}.`);
  };

  return (
    <>
      <Topbar title="Super Admin" subtitle="Dialer backends, delivery mode, and platform users" />

      <section className="panel platform-banner">
        <div>
          <p className="eyebrow">Delivery mode</p>
          <h3>{platform?.deliveryMode === 'live' ? 'Live SMS enabled' : 'Sandbox mode'}</h3>
          <p>{platform?.sandboxReason || 'Checking platform status...'}</p>
          {healthDetail.data?.liveReadiness?.blockers?.length > 0 && (
            <ul className="muted-copy" style={{ marginTop: '8px', paddingLeft: '1.2rem' }}>
              {healthDetail.data.liveReadiness.blockers.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
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
          <Input
            label="Warm-up recipient (optional)"
            value={form.warmup_to}
            onChange={(e) => setForm({ ...form, warmup_to: e.target.value })}
            placeholder="+15551234567 — sent on connect"
          />
          {form.warmup_to && (
            <label className="field checkbox-field">
              <input
                type="checkbox"
                checked={form.send_warmup}
                onChange={(e) => setForm({ ...form, send_warmup: e.target.checked })}
              />
              <span>Send warm-up message when connected</span>
            </label>
          )}
          <Button>Add backend</Button>
        </form>

        <form className="panel stack" onSubmit={sendTest}>
          <h3>Send test / warm-up SMS</h3>
          <p className="muted-copy">Routes through the selected backend. In sandbox mode, messages are simulated only.</p>
          <label className="field">
            <span>Backend</span>
            <select
              value={testForm.providerId}
              onChange={(e) => setTestForm({ ...testForm, providerId: e.target.value })}
            >
              <option value="">Default backend</option>
              {providers.data?.providers?.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.label || row.provider}{row.is_default ? ' (default)' : ''}
                </option>
              ))}
            </select>
          </label>
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
              <tr><th>Label</th><th>Type</th><th>Lane</th><th>Status</th><th>Health</th><th>Connection</th><th></th></tr>
            </thead>
            <tbody>
              {providers.data.providers.map((row) => (
                <tr key={row.id}>
                  <td>{row.label || row.provider}</td>
                  <td>{row.catalog?.label || row.provider}</td>
                  <td><span className="badge">{row.adapter_type || row.catalog?.lane || 'api'}</span></td>
                  <td><span className={`badge ${row.status}`}>{row.is_default ? 'default' : row.status}</span></td>
                  <td>
                    {row.health_checked_at ? (
                      <span className={`badge ${row.health_ok ? 'active' : 'warning'}`} title={row.health_error || row.health_mode || ''}>
                        {row.health_ok ? row.health_mode || 'ok' : 'unhealthy'}
                      </span>
                    ) : (
                      <span className="badge muted">unchecked</span>
                    )}
                  </td>
                  <td>
                    {connectionById[row.id] ? (
                      <span className={`badge ${connectionById[row.id].ok ? 'active' : 'warning'}`}>
                        {connectionById[row.id].ok ? 'connected' : 'failed'}
                      </span>
                    ) : (
                      <span className="badge muted">untested</span>
                    )}
                  </td>
                  <td className="row-actions">
                    <Button variant="ghost" onClick={() => testConnection(row.id)}>Test</Button>
                    <Button variant="ghost" onClick={() => sendWarmup(row.id)}>Warm-up</Button>
                    {!row.is_default && <Button variant="ghost" onClick={() => setDefault(row.id)}>Set default</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="code-box">
          API webhooks: /webhooks/&#123;provider&#125;/inbound · /status (vonage, twilio, telnyx, bandwidth, zoom, ringox, 3cx)
        </div>
      </section>

      <section className="panel">
        <h3>Browser automation profiles (DOM/BOM)</h3>
        <p className="muted-copy">
          Headless dialers (Google Voice, advertiser portals) run through the Python automation worker.
          API dialers use REST/webhooks above.
        </p>
        {!browserProfiles.data?.profiles?.length && (
          <p>No browser profiles yet. Add a Google Voice or Advertiser backend to auto-create one.</p>
        )}
        {Boolean(browserProfiles.data?.profiles?.length) && (
          <table>
            <thead>
              <tr><th>Label</th><th>Adapter</th><th>Portal</th><th>Engine</th><th>Selectors</th><th>Session</th><th></th></tr>
            </thead>
            <tbody>
              {browserProfiles.data.profiles.map((row) => (
                <tr key={row.id}>
                  <td>{row.label || row.adapter_id}</td>
                  <td>{row.adapter_id}</td>
                  <td className="truncate">{row.base_url || '—'}</td>
                  <td><span className="badge">{row.engine}</span></td>
                  <td><span className="badge muted">{row.selector_version || 'v1'}</span></td>
                  <td><span className={`badge ${row.session_status}`}>{row.session_status}</span></td>
                  <td className="row-actions">
                    <Button variant="ghost" onClick={() => browserLogin(row.id)}>Login</Button>
                    <Button variant="ghost" onClick={() => browserSession(row.id)}>Check</Button>
                    <Button variant="ghost" onClick={() => browserPoll(row.id)}>Poll</Button>
                    <Button variant="ghost" onClick={() => migrateSelectors(row.id)}>v2</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {notice && <div className="alert success">{notice}</div>}

      <section className="panel">
        <h3>Platform health & observability</h3>
        <div className="stat-grid admin-stats">
          <article className="stat-card">
            <span>Database</span>
            <strong>{healthDetail.data?.database ? 'OK' : '—'}</strong>
            <small>{healthDetail.data?.messages ?? 0} messages</small>
          </article>
          <article className="stat-card">
            <span>Backends</span>
            <strong>{healthDetail.data?.providers ?? 0}</strong>
            <small>{healthDetail.data?.platform?.deliveryMode || 'checking'}</small>
          </article>
          <article className="stat-card">
            <span>Worker</span>
            <strong>
              {!healthDetail.data?.automationWorker?.configured
                ? 'N/A'
                : healthDetail.data.automationWorker.ok
                  ? 'OK'
                  : 'Down'}
            </strong>
            <small>Browser lane automation</small>
          </article>
          <article className="stat-card">
            <span>Webhooks</span>
            <strong>{webhookLogs.data?.logs?.length ?? 0}</strong>
            <small>Recent events</small>
          </article>
        </div>
        <div className="two-column" style={{ marginTop: '1rem' }}>
          <div>
            <h4>Webhook log</h4>
            {!webhookLogs.data?.logs?.length && <p className="muted-copy">No webhook events yet.</p>}
            {Boolean(webhookLogs.data?.logs?.length) && (
              <table>
                <thead><tr><th>Provider</th><th>Type</th><th>Verified</th><th>When</th></tr></thead>
                <tbody>
                  {webhookLogs.data.logs.map((row) => (
                    <tr key={row.id}>
                      <td>{row.provider}</td>
                      <td>{row.event_type}</td>
                      <td><span className={`badge ${row.verified ? 'active' : 'warning'}`}>{row.verified ? 'yes' : 'no'}</span></td>
                      <td>{new Date(row.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div>
            <h4>Audit trail</h4>
            {!platformAudit.data?.audit?.length && <p className="muted-copy">No audit entries yet.</p>}
            {Boolean(platformAudit.data?.audit?.length) && (
              <table>
                <thead><tr><th>Action</th><th>Actor</th><th>When</th></tr></thead>
                <tbody>
                  {platformAudit.data.audit.map((row) => (
                    <tr key={row.id}>
                      <td>{row.action}</td>
                      <td>{row.actor_user_id}</td>
                      <td>{new Date(row.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div>
            <h4>Webhook dead letters</h4>
            {!deadLetters.data?.deadLetters?.length && <p className="muted-copy">No failed webhooks pending retry.</p>}
            {Boolean(deadLetters.data?.deadLetters?.length) && (
              <table>
                <thead><tr><th>Provider</th><th>Type</th><th>Error</th><th>Retries</th><th></th></tr></thead>
                <tbody>
                  {deadLetters.data.deadLetters.map((row) => (
                    <tr key={row.id}>
                      <td>{row.provider}</td>
                      <td>{row.event_type}</td>
                      <td className="truncate">{row.error_message}</td>
                      <td>{row.retry_count}</td>
                      <td>
                        <Button variant="ghost" onClick={async () => {
                          await api(`/api/super/webhook-dead-letters/${row.id}/retry`, { method: 'POST' });
                          deadLetters.refresh();
                          webhookLogs.refresh();
                        }}>Retry</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <Button variant="ghost" onClick={() => { healthDetail.refresh(); webhookLogs.refresh(); deadLetters.refresh(); platformAudit.refresh(); }}>
          Refresh observability
        </Button>
      </section>

      <section className="panel">
        <h3>Pending approvals</h3>
        {!pendingApprovals.data?.length && <p className="muted-copy">No users awaiting approval.</p>}
        {Boolean(pendingApprovals.data?.length) && (
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Org</th><th></th></tr></thead>
            <tbody>
              {pendingApprovals.data.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>{u.phone || '—'}</td>
                  <td>{u.organization_id || '—'}</td>
                  <td><Button variant="ghost" onClick={() => approveUser(u)}>Approve</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel stack">
        <h3>Create admin (+ new organization)</h3>
        <form className="stack" onSubmit={createAdmin}>
          <Input label="Admin name" name="name" required />
          <Input label="Email" name="email" type="email" required />
          <Input label="Password" name="password" type="password" required />
          <Input label="Organization name" name="org_name" required />
          <Button type="submit">Create admin</Button>
        </form>
      </section>

      <section className="panel">
        <h3>Organizations</h3>
        {!organizations.data?.organizations?.length && <p>Loading…</p>}
        {Boolean(organizations.data?.organizations?.length) && (
          <table>
            <thead><tr><th>Name</th><th>Users</th><th>Delivery</th><th>Admin</th><th></th></tr></thead>
            <tbody>
              {organizations.data.organizations.map((org) => (
                <tr key={org.id}>
                  <td>{org.brand_name || org.name}</td>
                  <td>{org.user_count}</td>
                  <td><span className={`badge ${org.delivery_mode === 'live' ? 'active' : 'warning'}`}>{org.delivery_mode}</span></td>
                  <td>{org.admin_name || '—'}</td>
                  <td><Button variant="ghost" onClick={() => toggleOrgLive(org)}>Toggle live</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h3>Platform users</h3>
        {!users.data?.length && <p>Loading users…</p>}
        {Boolean(users.data?.length) && (
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Org</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {users.data.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>{u.role}</td>
                  <td>{u.organization_id || '—'}</td>
                  <td><span className={`badge ${u.status}`}>{u.status}</span></td>
                  <td className="row-actions">
                    {u.role !== 'super_admin' && (
                      <>
                        <Button variant="ghost" onClick={() => suspendUser(u)}>
                          {u.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                        </Button>
                        {u.status === 'active' && u.role === 'user' && (
                          <Button variant="ghost" onClick={() => impersonateUser(u)}>Login as</Button>
                        )}
                        <Button variant="ghost" onClick={() => deleteUser(u)}>Delete</Button>
                      </>
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
