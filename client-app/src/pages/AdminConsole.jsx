import { useState } from 'react';
import { api, API_BASE } from '../api/client';
import useAsync from '../hooks/useAsync';
import Topbar from '../components/Topbar';
import Button from '../components/Button';
import Input from '../components/Input';

export default function AdminConsole() {
  const [tab, setTab] = useState('users');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [newKey, setNewKey] = useState(null);
  const [brandForm, setBrandForm] = useState(null);

  const users = useAsync(
    () => api(`/api/admin/users?search=${encodeURIComponent(search)}`),
    [search]
  );
  const pendingApprovals = useAsync(() => api('/api/admin/pending-approvals'), []);
  const usage = useAsync(() => api('/api/admin/usage'), []);
  const audit = useAsync(() => api('/api/admin/audit-logs?limit=30'), []);
  const branding = useAsync(() => api('/api/admin/branding'), []);
  const apiKeys = useAsync(() => api('/api/admin/api-keys'), []);

  const toggleStatus = async (user) => {
    setNotice('');
    const next = user.status === 'suspended' ? 'active' : 'suspended';
    try {
      await api(`/api/admin/users/${user.id}/status`, {
        method: 'PUT',
        body: { status: next },
      });
      setNotice(`${user.name} is now ${next}.`);
      users.refresh();
      audit.refresh();
    } catch (error) {
      setNotice(error.message);
    }
  };

  const updatePlan = async (user) => {
    const plan = window.prompt('Plan name (e.g. pro, starter):', user.subscription_plan || 'starter');
    if (!plan) return;
    const msgLimit = window.prompt('Monthly message limit:', String(user.message_limit_monthly || 1000));
    const numLimit = window.prompt('Number limit:', String(user.number_limit || 2));
    setNotice('');
    try {
      await api(`/api/admin/users/${user.id}/subscription`, {
        method: 'PUT',
        body: {
          plan_name: plan,
          message_limit_monthly: msgLimit ? Number(msgLimit) : undefined,
          number_limit: numLimit ? Number(numLimit) : undefined,
        },
      });
      setNotice(`Updated plan for ${user.name}.`);
      users.refresh();
    } catch (error) {
      setNotice(error.message);
    }
  };

  const createUser = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setNotice('');
    try {
      await api('/api/admin/users', {
        method: 'POST',
        body: {
          name: form.get('name'),
          email: form.get('email'),
          password: form.get('password'),
          phone: form.get('phone') || undefined,
        },
      });
      setNotice('User created.');
      users.refresh();
      event.currentTarget.reset();
    } catch (error) {
      setNotice(error.message);
    }
  };

  const deleteUser = async (user) => {
    if (!window.confirm(`Deactivate ${user.name}?`)) return;
    try {
      await api(`/api/admin/users/${user.id}`, { method: 'DELETE' });
      setNotice(`${user.name} deactivated.`);
      users.refresh();
    } catch (error) {
      setNotice(error.message);
    }
  };

  const approveUser = async (user) => {
    try {
      await api(`/api/admin/users/${user.id}/approve`, { method: 'POST' });
      setNotice(`Approved ${user.name}`);
      pendingApprovals.refresh();
      users.refresh();
    } catch (error) {
      setNotice(error.message);
    }
  };

  const exportAudit = async () => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE}/api/admin/audit-logs/export`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error('Export failed');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'signalmint-audit-export.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const saveBranding = async (event) => {
    event.preventDefault();
    setNotice('');
    try {
      await api('/api/admin/branding', { method: 'PUT', body: brandForm || branding.data });
      setNotice('Branding updated.');
      branding.refresh();
    } catch (error) {
      setNotice(error.message);
    }
  };

  const createApiKey = async () => {
    const name = window.prompt('Key name (e.g. CRM integration):', 'Integration');
    if (!name) return;
    setNotice('');
    try {
      const created = await api('/api/admin/api-keys', { method: 'POST', body: { name } });
      setNewKey(created.key);
      apiKeys.refresh();
      audit.refresh();
    } catch (error) {
      setNotice(error.message);
    }
  };

  const revokeKey = async (key) => {
    if (!window.confirm(`Revoke API key "${key.name}"?`)) return;
    try {
      await api(`/api/admin/api-keys/${key.id}`, { method: 'DELETE' });
      apiKeys.refresh();
      setNotice('API key revoked.');
    } catch (error) {
      setNotice(error.message);
    }
  };

  const totalMessages = usage.data?.reduce((sum, row) => sum + (row.message_count || 0), 0) || 0;
  const totalDelivered = usage.data?.reduce((sum, row) => sum + (row.delivered_count || 0), 0) || 0;

  const brandValues = brandForm || branding.data || {};

  return (
    <>
      <Topbar title="Team admin" subtitle="Users, branding, API keys, and SOC2 audit export" />

      <section className="stat-grid admin-stats">
        <article className="stat-card"><span>Users</span><strong>{users.data?.length ?? '—'}</strong><small>Team members in your org</small></article>
        <article className="stat-card"><span>Messages</span><strong>{totalMessages}</strong><small>All time (excludes mock)</small></article>
        <article className="stat-card"><span>Delivered</span><strong>{totalDelivered}</strong><small>Sent or delivered status</small></article>
        <article className="stat-card"><span>API keys</span><strong>{apiKeys.data?.length ?? '—'}</strong><small>Active integration keys</small></article>
      </section>

      <div className="auth-tabs" style={{ marginBottom: '1rem' }}>
        <button type="button" className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>Users</button>
        <button type="button" className={tab === 'usage' ? 'active' : ''} onClick={() => setTab('usage')}>Usage</button>
        <button type="button" className={tab === 'audit' ? 'active' : ''} onClick={() => setTab('audit')}>Audit log</button>
        <button type="button" className={tab === 'branding' ? 'active' : ''} onClick={() => setTab('branding')}>Branding</button>
        <button type="button" className={tab === 'apikeys' ? 'active' : ''} onClick={() => setTab('apikeys')}>API keys</button>
      </div>

      {notice && <div className="alert success">{notice}</div>}
      {newKey && (
        <div className="alert warn">
          Copy your new API key now — it won&apos;t be shown again:<br />
          <code>{newKey}</code>
          <Button variant="ghost" onClick={() => setNewKey(null)}>Dismiss</Button>
        </div>
      )}

      {tab === 'users' && (
        <section className="panel stack">
          <h3>Create user</h3>
          <form className="stack" onSubmit={createUser} style={{ marginBottom: '1.5rem' }}>
            <Input label="Name" name="name" required />
            <Input label="Email" name="email" type="email" required />
            <Input label="Phone" name="phone" placeholder="+15551234567" />
            <Input label="Password" name="password" type="password" required />
            <Button type="submit">Create user</Button>
          </form>

          {Boolean(pendingApprovals.data?.length) && (
            <>
              <h3>Pending approvals</h3>
              <table style={{ marginBottom: '1.5rem' }}>
                <thead><tr><th>Name</th><th>Email</th><th></th></tr></thead>
                <tbody>
                  {pendingApprovals.data.map((u) => (
                    <tr key={u.id}>
                      <td>{u.name}</td>
                      <td>{u.email}</td>
                      <td><Button variant="ghost" onClick={() => approveUser(u)}>Approve</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <div className="row-actions" style={{ marginBottom: '1rem' }}>
            <Input label="Search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or email" />
            <Button variant="ghost" onClick={() => users.refresh()}>Refresh</Button>
          </div>
          {!users.data?.length && <p>No users found for your organization.</p>}
          {Boolean(users.data?.length) && (
            <table>
              <thead>
                <tr><th>Name</th><th>Email</th><th>Role</th><th>Plan</th><th>Limits</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {users.data.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>{u.role}</td>
                    <td>{u.subscription_plan || '—'}</td>
                    <td><small>{u.message_limit_monthly || '—'} msgs / {u.number_limit || '—'} nums</small></td>
                    <td><span className={`badge ${u.status}`}>{u.status}</span></td>
                    <td className="row-actions">
                      {u.role === 'user' && (
                        <>
                          <Button variant="ghost" onClick={() => toggleStatus(u)}>
                            {u.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                          </Button>
                          <Button variant="ghost" onClick={() => updatePlan(u)}>Plan</Button>
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
      )}

      {tab === 'usage' && (
        <section className="panel">
          <h3>Message usage by user</h3>
          {!usage.data?.length && <p>No usage data yet.</p>}
          {Boolean(usage.data?.length) && (
            <table>
              <thead>
                <tr><th>User</th><th>Messages</th><th>Delivered</th><th>Failed</th><th>Est. cost</th></tr>
              </thead>
              <tbody>
                {usage.data.map((row) => (
                  <tr key={row.user_email}>
                    <td>{row.user_name}<br /><small>{row.user_email}</small></td>
                    <td>{row.message_count}</td>
                    <td>{row.delivered_count}</td>
                    <td>{row.failed_count}</td>
                    <td>{row.total_cost != null ? `$${Number(row.total_cost).toFixed(4)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {tab === 'audit' && (
        <section className="panel">
          <div className="row-actions" style={{ marginBottom: '1rem' }}>
            <h3>Audit log</h3>
            <Button variant="ghost" onClick={() => exportAudit().catch((e) => setNotice(e.message))}>Export CSV (SOC2)</Button>
          </div>
          {!audit.data?.length && <p>No audit entries yet.</p>}
          {Boolean(audit.data?.length) && (
            <table>
              <thead>
                <tr><th>When</th><th>Actor</th><th>Target</th><th>Action</th></tr>
              </thead>
              <tbody>
                {audit.data.map((row) => {
                  const details = typeof row.details === 'string' ? JSON.parse(row.details) : row.details;
                  const actionLabel = row.action === 'message_status_changed' && details?.toStatus
                    ? `Message ${details.fromStatus || 'new'} → ${details.toStatus}`
                    : row.action;
                  return (
                    <tr key={row.id}>
                      <td>{new Date(row.created_at).toLocaleString()}</td>
                      <td>{row.actor_name || row.actor_user_id}</td>
                      <td>{row.target_name || row.target_user_id || '—'}</td>
                      <td>{actionLabel}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      )}

      {tab === 'branding' && (
        <section className="panel stack">
          <h3>White-label branding</h3>
          <form className="stack" onSubmit={saveBranding}>
            <Input label="Brand name">
              <input
                value={brandValues.brandName || ''}
                onChange={(e) => setBrandForm({ ...brandValues, brandName: e.target.value })}
              />
            </Input>
            <Input label="Primary color">
              <input
                type="color"
                value={brandValues.primaryColor || '#2563eb'}
                onChange={(e) => setBrandForm({ ...brandValues, primaryColor: e.target.value })}
              />
            </Input>
            <Input label="Support email">
              <input
                type="email"
                value={brandValues.supportEmail || ''}
                onChange={(e) => setBrandForm({ ...brandValues, supportEmail: e.target.value })}
              />
            </Input>
            <Input label="Message retention (days)">
              <input
                type="number"
                min="0"
                value={brandValues.messageRetentionDays ?? ''}
                onChange={(e) => setBrandForm({ ...brandValues, messageRetentionDays: Number(e.target.value) || null })}
              />
            </Input>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={Boolean(brandValues.hipaaMode)}
                onChange={(e) => setBrandForm({ ...brandValues, hipaaMode: e.target.checked })}
              />
              HIPAA mode (enables retention audit trail)
            </label>
            <Button type="submit">Save branding</Button>
          </form>
        </section>
      )}

      {tab === 'apikeys' && (
        <section className="panel">
          <div className="row-actions" style={{ marginBottom: '1rem' }}>
            <h3>Integration API keys</h3>
            <Button onClick={createApiKey}>Create key</Button>
          </div>
          <p className="muted-copy">Use keys with <code>Authorization: Bearer smk_…</code> on <code>/api/v1/*</code></p>
          {!apiKeys.data?.length && <p>No API keys yet.</p>}
          {Boolean(apiKeys.data?.length) && (
            <table>
              <thead>
                <tr><th>Name</th><th>Prefix</th><th>Scopes</th><th>Last used</th><th></th></tr>
              </thead>
              <tbody>
                {apiKeys.data.map((key) => (
                  <tr key={key.id}>
                    <td>{key.name}</td>
                    <td><code>{key.key_prefix}…</code></td>
                    <td>{(key.scopes || []).join(', ')}</td>
                    <td>{key.last_used_at ? new Date(key.last_used_at).toLocaleString() : '—'}</td>
                    <td><Button variant="danger" onClick={() => revokeKey(key)}>Revoke</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </>
  );
}
