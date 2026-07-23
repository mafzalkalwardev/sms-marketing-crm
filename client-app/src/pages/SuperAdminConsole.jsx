import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  Building2,
  Globe,
  RefreshCw,
  Send,
  Server,
  UserCog,
  UserPlus,
  Users,
} from 'lucide-react';
import { api } from '../api/client';
import useAsync from '../hooks/useAsync';
import Topbar from '../components/Topbar';
import StatCard from '../components/StatCard';
import Button from '../components/Button';
import Input from '../components/Input';
import Modal from '../components/Modal';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

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

const PLAN_PRESETS = {
  starter: { plan: 'starter', message_limit_monthly: 1000, number_limit: 2 },
  pro: { plan: 'pro', message_limit_monthly: 5000, number_limit: 10 },
  enterprise: { plan: 'enterprise', message_limit_monthly: 50000, number_limit: 50 },
};

const ADMIN_LIMIT_DEFAULTS = PLAN_PRESETS.pro;
const USER_LIMIT_DEFAULTS = PLAN_PRESETS.starter;

const panelMotion = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25 },
};

const selectClassName =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function StatusBadge({ status, children, muted = false, ...props }) {
  const label = children ?? status;
  if (muted) return <Badge variant="secondary" {...props}>{label}</Badge>;
  let variant = 'secondary';
  if (['active', 'live', 'default', 'ok', 'connected', 'yes'].includes(status)) variant = 'success';
  else if (['suspended', 'warning', 'sandbox', 'failed', 'unhealthy', 'no'].includes(status)) variant = 'warning';
  return <Badge variant={variant} {...props}>{label}</Badge>;
}

function NoticeAlert({ message }) {
  if (!message) return null;
  return (
    <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
      {message}
    </div>
  );
}

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
  const [roleFilter, setRoleFilter] = useState('all');
  const [limitsUser, setLimitsUser] = useState(null);
  const [limitsForm, setLimitsForm] = useState({
    preset: 'custom',
    plan: '',
    message_limit_monthly: '',
    number_limit: '',
    subscription_expires_at: '',
  });

  const adminUsers = useMemo(
    () => (users.data || []).filter((u) => u.role === 'admin' && u.status === 'active'),
    [users.data]
  );

  const filteredUsers = useMemo(() => {
    const list = users.data || [];
    if (roleFilter === 'all') return list;
    return list.filter((u) => u.role === roleFilter);
  }, [users.data, roleFilter]);

  const openLimitsModal = (user) => {
    const preset = Object.entries(PLAN_PRESETS).find(
      ([, values]) =>
        values.plan === user.subscription_plan
        && values.message_limit_monthly === user.message_limit_monthly
        && values.number_limit === user.number_limit
    )?.[0] || 'custom';

    setLimitsUser(user);
    setLimitsForm({
      preset,
      plan: user.subscription_plan || (user.role === 'admin' ? 'pro' : 'starter'),
      message_limit_monthly: String(user.message_limit_monthly ?? (user.role === 'admin' ? 5000 : 1000)),
      number_limit: String(user.number_limit ?? (user.role === 'admin' ? 10 : 2)),
      subscription_expires_at: user.subscription_expires_at
        ? user.subscription_expires_at.slice(0, 10)
        : '',
    });
  };

  const applyLimitsPreset = (presetKey) => {
    if (presetKey === 'custom') {
      setLimitsForm((prev) => ({ ...prev, preset: 'custom' }));
      return;
    }
    const preset = PLAN_PRESETS[presetKey];
    if (!preset) return;
    setLimitsForm({
      preset: presetKey,
      plan: preset.plan,
      message_limit_monthly: String(preset.message_limit_monthly),
      number_limit: String(preset.number_limit),
      subscription_expires_at: limitsForm.subscription_expires_at,
    });
  };

  const saveLimits = async (event) => {
    event.preventDefault();
    if (!limitsUser) return;
    setNotice('');
    try {
      await api(`/api/super/users/${limitsUser.id}/limits`, {
        method: 'PUT',
        body: {
          plan_name: limitsForm.plan,
          message_limit_monthly: Number(limitsForm.message_limit_monthly),
          number_limit: Number(limitsForm.number_limit),
          subscription_expires_at: limitsForm.subscription_expires_at || null,
        },
      });
      setNotice(`Limits updated for ${limitsUser.name}.`);
      setLimitsUser(null);
      users.refresh();
    } catch (error) {
      setNotice(error.message);
    }
  };

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
    const formData = new FormData(event.currentTarget);
    try {
      await api('/api/super/users', {
        method: 'POST',
        body: {
          name: formData.get('name'),
          email: formData.get('email'),
          password: formData.get('password'),
          role: 'admin',
          org_name: formData.get('org_name'),
          subscription_plan: formData.get('subscription_plan') || ADMIN_LIMIT_DEFAULTS.plan,
          message_limit_monthly: Number(formData.get('message_limit_monthly') || ADMIN_LIMIT_DEFAULTS.message_limit_monthly),
          number_limit: Number(formData.get('number_limit') || ADMIN_LIMIT_DEFAULTS.number_limit),
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

  const createUser = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const managedByAdminId = formData.get('managed_by_admin_id');
    try {
      await api('/api/super/users', {
        method: 'POST',
        body: {
          name: formData.get('name'),
          email: formData.get('email'),
          password: formData.get('password'),
          phone: formData.get('phone') || undefined,
          role: 'user',
          managed_by_admin_id: managedByAdminId ? Number(managedByAdminId) : undefined,
          subscription_plan: formData.get('subscription_plan') || USER_LIMIT_DEFAULTS.plan,
          message_limit_monthly: Number(formData.get('message_limit_monthly') || USER_LIMIT_DEFAULTS.message_limit_monthly),
          number_limit: Number(formData.get('number_limit') || USER_LIMIT_DEFAULTS.number_limit),
        },
      });
      setNotice('User created.');
      users.refresh();
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

      <motion.div {...panelMotion}>
        <Card className="mb-6">
          <CardContent className="flex flex-wrap items-start justify-between gap-4 p-6">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Delivery mode</p>
              <h3 className="font-display text-xl font-semibold">
                {platform?.deliveryMode === 'live' ? 'Live SMS enabled' : 'Sandbox mode'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {platform?.sandboxReason || 'Checking platform status...'}
              </p>
              {healthDetail.data?.liveReadiness?.blockers?.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {healthDetail.data.liveReadiness.blockers.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
            <StatusBadge status={platform?.deliveryMode === 'live' ? 'live' : 'warning'}>
              {platform?.deliveryMode || 'checking'}
            </StatusBadge>
          </CardContent>
        </Card>
      </motion.div>

      <section className="mb-6 grid gap-4 lg:grid-cols-2">
        <motion.div {...panelMotion}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Server className="h-5 w-5" />
                Add dialer backend
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={addProvider}>
                <div className="space-y-1.5">
                  <Label>Dialer type</Label>
                  <Select value={form.provider} onValueChange={(value) => setForm({ ...form, provider: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select dialer type" />
                    </SelectTrigger>
                    <SelectContent>
                      {catalog.data?.catalog?.map((entry) => (
                        <SelectItem key={entry.id} value={entry.id}>
                          {entry.label} ({entry.lane === 'browser' ? 'Browser' : 'API'})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  label="Label"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="Primary sales line"
                />
                {isBrowser ? (
                  <Input
                    label="Portal URL"
                    value={form.base_url}
                    onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                    placeholder="https://voice.google.com"
                    required
                  />
                ) : (
                  <>
                    {form.provider === 'twilio' && (
                      <Input
                        label="Account SID"
                        value={form.account_sid}
                        onChange={(e) => setForm({ ...form, account_sid: e.target.value })}
                        required
                      />
                    )}
                    <Input
                      label={form.provider === 'twilio' ? 'Auth token' : 'API key'}
                      value={form.api_key}
                      onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                      required
                    />
                    {form.provider !== 'telnyx' && (
                      <Input
                        label="API secret"
                        type="password"
                        value={form.api_secret}
                        onChange={(e) => setForm({ ...form, api_secret: e.target.value })}
                        required
                      />
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
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.send_warmup}
                      onChange={(e) => setForm({ ...form, send_warmup: e.target.checked })}
                      className="rounded border-input"
                    />
                    <span>Send warm-up message when connected</span>
                  </label>
                )}
                <Button type="submit">Add backend</Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div {...panelMotion}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Send className="h-5 w-5" />
                Send test / warm-up SMS
              </CardTitle>
              <CardDescription>
                Routes through the selected backend. In sandbox mode, messages are simulated only.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={sendTest}>
                <div className="space-y-1.5">
                  <Label>Backend</Label>
                  <Select
                    value={testForm.providerId || 'default'}
                    onValueChange={(value) =>
                      setTestForm({ ...testForm, providerId: value === 'default' ? '' : value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Default backend" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default backend</SelectItem>
                      {providers.data?.providers?.map((row) => (
                        <SelectItem key={row.id} value={String(row.id)}>
                          {row.label || row.provider}{row.is_default ? ' (default)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  label="Recipient"
                  value={testForm.to}
                  onChange={(e) => setTestForm({ ...testForm, to: e.target.value })}
                  placeholder="+15551234567"
                  required
                />
                <div className="space-y-1.5">
                  <Label>Message</Label>
                  <Textarea
                    value={testForm.message}
                    onChange={(e) => setTestForm({ ...testForm, message: e.target.value })}
                    required
                  />
                </div>
                <Button type="submit">Send test</Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </section>

      <motion.div {...panelMotion} className="mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Configured dialer backends</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!providers.data?.providers?.length && (
              <p className="text-sm text-muted-foreground">
                No backends configured yet. Add Vonage, Twilio, or a browser dialer above.
              </p>
            )}
            {Boolean(providers.data?.providers?.length) && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Lane</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead>Connection</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {providers.data.providers.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.label || row.provider}</TableCell>
                      <TableCell>{row.catalog?.label || row.provider}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{row.adapter_type || row.catalog?.lane || 'api'}</Badge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={row.is_default ? 'default' : row.status}>
                          {row.is_default ? 'default' : row.status}
                        </StatusBadge>
                      </TableCell>
                      <TableCell>
                        {row.health_checked_at ? (
                          <StatusBadge
                            status={row.health_ok ? 'ok' : 'unhealthy'}
                            title={row.health_error || row.health_mode || ''}
                          >
                            {row.health_ok ? row.health_mode || 'ok' : 'unhealthy'}
                          </StatusBadge>
                        ) : (
                          <StatusBadge status="muted" muted>
                            unchecked
                          </StatusBadge>
                        )}
                      </TableCell>
                      <TableCell>
                        {connectionById[row.id] ? (
                          <StatusBadge status={connectionById[row.id].ok ? 'connected' : 'failed'}>
                            {connectionById[row.id].ok ? 'connected' : 'failed'}
                          </StatusBadge>
                        ) : (
                          <StatusBadge status="muted" muted>
                            untested
                          </StatusBadge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => testConnection(row.id)}>
                            Test
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => sendWarmup(row.id)}>
                            Warm-up
                          </Button>
                          {!row.is_default && (
                            <Button variant="ghost" size="sm" onClick={() => setDefault(row.id)}>
                              Set default
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
              API webhooks: /webhooks/&#123;provider&#125;/inbound · /status (vonage, twilio, telnyx, bandwidth, zoom, ringox, 3cx)
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div {...panelMotion} className="mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Globe className="h-5 w-5" />
              Browser automation profiles (DOM/BOM)
            </CardTitle>
            <CardDescription>
              Headless dialers (Google Voice, advertiser portals) run through the Python automation worker.
              API dialers use REST/webhooks above.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!browserProfiles.data?.profiles?.length && (
              <p className="text-sm text-muted-foreground">
                No browser profiles yet. Add a Google Voice or Advertiser backend to auto-create one.
              </p>
            )}
            {Boolean(browserProfiles.data?.profiles?.length) && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead>Adapter</TableHead>
                    <TableHead>Portal</TableHead>
                    <TableHead>Engine</TableHead>
                    <TableHead>Selectors</TableHead>
                    <TableHead>Session</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {browserProfiles.data.profiles.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.label || row.adapter_id}</TableCell>
                      <TableCell>{row.adapter_id}</TableCell>
                      <TableCell className="max-w-[180px] truncate">{row.base_url || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{row.engine}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{row.selector_version || 'v1'}</Badge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={row.session_status}>{row.session_status}</StatusBadge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => browserLogin(row.id)}>
                            Login
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => browserSession(row.id)}>
                            Check
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => browserPoll(row.id)}>
                            Poll
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => migrateSelectors(row.id)}>
                            v2
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {notice && <NoticeAlert message={notice} />}

      <motion.div {...panelMotion} className="mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="h-5 w-5" />
              Platform health & observability
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Database"
                value={healthDetail.data?.database ? 'OK' : '—'}
                hint={`${healthDetail.data?.messages ?? 0} messages`}
              />
              <StatCard
                label="Backends"
                value={healthDetail.data?.providers ?? 0}
                hint={healthDetail.data?.platform?.deliveryMode || 'checking'}
              />
              <StatCard
                label="Worker"
                value={
                  !healthDetail.data?.automationWorker?.configured
                    ? 'N/A'
                    : healthDetail.data.automationWorker.ok
                      ? 'OK'
                      : 'Down'
                }
                hint="Browser lane automation"
              />
              <StatCard
                label="Webhooks"
                value={webhookLogs.data?.logs?.length ?? 0}
                hint="Recent events"
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-3">
                <h4 className="font-display text-sm font-semibold">Webhook log</h4>
                {!webhookLogs.data?.logs?.length && (
                  <p className="text-sm text-muted-foreground">No webhook events yet.</p>
                )}
                {Boolean(webhookLogs.data?.logs?.length) && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Provider</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Verified</TableHead>
                        <TableHead>When</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {webhookLogs.data.logs.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{row.provider}</TableCell>
                          <TableCell>{row.event_type}</TableCell>
                          <TableCell>
                            <StatusBadge status={row.verified ? 'yes' : 'no'}>
                              {row.verified ? 'yes' : 'no'}
                            </StatusBadge>
                          </TableCell>
                          <TableCell>{new Date(row.created_at).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              <div className="space-y-3">
                <h4 className="font-display text-sm font-semibold">Audit trail</h4>
                {!platformAudit.data?.audit?.length && (
                  <p className="text-sm text-muted-foreground">No audit entries yet.</p>
                )}
                {Boolean(platformAudit.data?.audit?.length) && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Action</TableHead>
                        <TableHead>Actor</TableHead>
                        <TableHead>When</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {platformAudit.data.audit.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{row.action}</TableCell>
                          <TableCell>{row.actor_user_id}</TableCell>
                          <TableCell>{new Date(row.created_at).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              <div className="space-y-3">
                <h4 className="font-display text-sm font-semibold">Webhook dead letters</h4>
                {!deadLetters.data?.deadLetters?.length && (
                  <p className="text-sm text-muted-foreground">No failed webhooks pending retry.</p>
                )}
                {Boolean(deadLetters.data?.deadLetters?.length) && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Provider</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Error</TableHead>
                        <TableHead>Retries</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deadLetters.data.deadLetters.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{row.provider}</TableCell>
                          <TableCell>{row.event_type}</TableCell>
                          <TableCell className="max-w-[160px] truncate">{row.error_message}</TableCell>
                          <TableCell>{row.retry_count}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                await api(`/api/super/webhook-dead-letters/${row.id}/retry`, { method: 'POST' });
                                deadLetters.refresh();
                                webhookLogs.refresh();
                              }}
                            >
                              Retry
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>

            <Button
              variant="ghost"
              onClick={() => {
                healthDetail.refresh();
                webhookLogs.refresh();
                deadLetters.refresh();
                platformAudit.refresh();
              }}
            >
              <RefreshCw className="mr-1.5 h-4 w-4" />
              Refresh observability
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div {...panelMotion} className="mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pending approvals</CardTitle>
          </CardHeader>
          <CardContent>
            {!pendingApprovals.data?.length && (
              <p className="text-sm text-muted-foreground">No users awaiting approval.</p>
            )}
            {Boolean(pendingApprovals.data?.length) && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Org</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingApprovals.data.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>{u.name}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>{u.phone || '—'}</TableCell>
                      <TableCell>{u.organization_id || '—'}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => approveUser(u)}>
                          Approve
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <section className="mb-6 grid gap-4 lg:grid-cols-2">
        <motion.div {...panelMotion}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <UserCog className="h-5 w-5" />
                Create admin (+ new organization)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={createAdmin}>
                <Input label="Admin name" name="name" required />
                <Input label="Email" name="email" type="email" required />
                <Input label="Password" name="password" type="password" required />
                <Input label="Organization name" name="org_name" required />
                <div className="space-y-1.5">
                  <Label>Plan preset</Label>
                  <select name="subscription_plan" defaultValue={ADMIN_LIMIT_DEFAULTS.plan} className={selectClassName}>
                    <option value="starter">Starter (1,000 msgs / 2 numbers)</option>
                    <option value="pro">Pro (5,000 msgs / 10 numbers)</option>
                    <option value="enterprise">Enterprise (50,000 msgs / 50 numbers)</option>
                  </select>
                </div>
                <Input
                  label="Monthly message limit"
                  name="message_limit_monthly"
                  type="number"
                  min="0"
                  defaultValue={String(ADMIN_LIMIT_DEFAULTS.message_limit_monthly)}
                />
                <Input
                  label="Number limit"
                  name="number_limit"
                  type="number"
                  min="0"
                  defaultValue={String(ADMIN_LIMIT_DEFAULTS.number_limit)}
                />
                <Button type="submit">Create admin</Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div {...panelMotion}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <UserPlus className="h-5 w-5" />
                Create user (under admin)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={createUser}>
                <Input label="User name" name="name" required />
                <Input label="Email" name="email" type="email" required />
                <Input label="Password" name="password" type="password" required />
                <Input label="Phone (optional)" name="phone" />
                <div className="space-y-1.5">
                  <Label>Managing admin</Label>
                  <select name="managed_by_admin_id" required defaultValue="" className={selectClassName}>
                    <option value="" disabled>
                      Select admin…
                    </option>
                    {adminUsers.map((admin) => (
                      <option key={admin.id} value={admin.id}>
                        {admin.name} ({admin.email})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Plan preset</Label>
                  <select name="subscription_plan" defaultValue={USER_LIMIT_DEFAULTS.plan} className={selectClassName}>
                    <option value="starter">Starter (1,000 msgs / 2 numbers)</option>
                    <option value="pro">Pro (5,000 msgs / 10 numbers)</option>
                    <option value="enterprise">Enterprise (50,000 msgs / 50 numbers)</option>
                  </select>
                </div>
                <Input
                  label="Monthly message limit"
                  name="message_limit_monthly"
                  type="number"
                  min="0"
                  defaultValue={String(USER_LIMIT_DEFAULTS.message_limit_monthly)}
                />
                <Input
                  label="Number limit"
                  name="number_limit"
                  type="number"
                  min="0"
                  defaultValue={String(USER_LIMIT_DEFAULTS.number_limit)}
                />
                <Button type="submit">Create user</Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </section>

      <motion.div {...panelMotion} className="mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 className="h-5 w-5" />
              Organizations
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!organizations.data?.organizations?.length && <p className="text-sm text-muted-foreground">Loading…</p>}
            {Boolean(organizations.data?.organizations?.length) && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Users</TableHead>
                    <TableHead>Delivery</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {organizations.data.organizations.map((org) => (
                    <TableRow key={org.id}>
                      <TableCell className="font-medium">{org.brand_name || org.name}</TableCell>
                      <TableCell>{org.user_count}</TableCell>
                      <TableCell>
                        <StatusBadge status={org.delivery_mode === 'live' ? 'live' : 'sandbox'}>
                          {org.delivery_mode}
                        </StatusBadge>
                      </TableCell>
                      <TableCell>{org.admin_name || '—'}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => toggleOrgLive(org)}>
                          Toggle live
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div {...panelMotion} className="mb-6">
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5" />
              Platform users
            </CardTitle>
            <div className="flex flex-wrap gap-1">
              {['all', 'admin', 'user'].map((filter) => (
                <Button
                  key={filter}
                  variant={roleFilter === filter ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => setRoleFilter(filter)}
                >
                  {filter === 'all' ? 'All' : filter === 'admin' ? 'Admins' : 'Users'}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {!filteredUsers.length && (
              <p className="text-sm text-muted-foreground">
                {users.loading ? 'Loading users…' : 'No users match this filter.'}
              </p>
            )}
            {Boolean(filteredUsers.length) && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Org</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Limits</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>{u.role}</TableCell>
                      <TableCell>{u.organization_id || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{u.subscription_plan || '—'}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {u.message_limit_monthly ?? '—'} msgs / {u.number_limit ?? '—'} nums
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={u.status} />
                      </TableCell>
                      <TableCell>
                        {u.role !== 'super_admin' && (
                          <div className="flex flex-wrap justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openLimitsModal(u)}>
                              Limits
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => suspendUser(u)}>
                              {u.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                            </Button>
                            {u.status === 'active' && u.role === 'user' && (
                              <Button variant="ghost" size="sm" onClick={() => impersonateUser(u)}>
                                Login as
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => deleteUser(u)}>
                              Delete
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {limitsUser && (
        <Modal title={`Set limits — ${limitsUser.name}`} onClose={() => setLimitsUser(null)} wide>
          <form className="space-y-3" onSubmit={saveLimits}>
            <div className="space-y-1.5">
              <Label>Plan preset</Label>
              <Select value={limitsForm.preset} onValueChange={applyLimitsPreset}>
                <SelectTrigger>
                  <SelectValue placeholder="Select preset" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter">Starter (1,000 / 2)</SelectItem>
                  <SelectItem value="pro">Pro (5,000 / 10)</SelectItem>
                  <SelectItem value="enterprise">Enterprise (50,000 / 50)</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input
              label="Plan name"
              value={limitsForm.plan}
              onChange={(e) => setLimitsForm({ ...limitsForm, plan: e.target.value, preset: 'custom' })}
              required
            />
            <Input
              label="Monthly message limit"
              type="number"
              min="0"
              value={limitsForm.message_limit_monthly}
              onChange={(e) =>
                setLimitsForm({ ...limitsForm, message_limit_monthly: e.target.value, preset: 'custom' })
              }
              required
            />
            <Input
              label="Number limit"
              type="number"
              min="0"
              value={limitsForm.number_limit}
              onChange={(e) => setLimitsForm({ ...limitsForm, number_limit: e.target.value, preset: 'custom' })}
              required
            />
            <Input
              label="Subscription expires (optional)"
              type="date"
              value={limitsForm.subscription_expires_at}
              onChange={(e) => setLimitsForm({ ...limitsForm, subscription_expires_at: e.target.value })}
            />
            <div className="flex flex-wrap gap-2 pt-2">
              <Button type="submit">Save limits</Button>
              <Button variant="ghost" type="button" onClick={() => setLimitsUser(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
