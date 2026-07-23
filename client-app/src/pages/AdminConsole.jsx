import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3,
  Download,
  FileText,
  Key,
  Palette,
  RefreshCw,
  UserPlus,
  Users,
} from 'lucide-react';
import { api, API_BASE } from '../api/client';
import useAsync from '../hooks/useAsync';
import Topbar from '../components/Topbar';
import StatCard from '../components/StatCard';
import Button from '../components/Button';
import Input from '../components/Input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input as ShadInput } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

const panelMotion = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25 },
};

function StatusBadge({ status, children }) {
  const label = children ?? status;
  let variant = 'secondary';
  if (['active', 'live', 'delivered', 'default'].includes(status)) variant = 'success';
  else if (['suspended', 'warning', 'sandbox', 'pending'].includes(status)) variant = 'warning';
  return <Badge variant={variant}>{label}</Badge>;
}

function NoticeAlert({ message, variant = 'success', className, children }) {
  if (!message && !children) return null;
  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2 text-sm',
        variant === 'warn'
          ? 'border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
          : 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200',
        className
      )}
    >
      {children ?? message}
    </div>
  );
}

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

      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Users" value={users.data?.length ?? '—'} hint="Team members in your org" />
        <StatCard label="Messages" value={totalMessages} hint="All time (excludes mock)" />
        <StatCard label="Delivered" value={totalDelivered} hint="Sent or delivered status" />
        <StatCard label="API keys" value={apiKeys.data?.length ?? '—'} hint="Active integration keys" />
      </section>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="users" className="gap-1.5">
            <Users className="h-4 w-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="usage" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Usage
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5">
            <FileText className="h-4 w-4" />
            Audit log
          </TabsTrigger>
          <TabsTrigger value="branding" className="gap-1.5">
            <Palette className="h-4 w-4" />
            Branding
          </TabsTrigger>
          <TabsTrigger value="apikeys" className="gap-1.5">
            <Key className="h-4 w-4" />
            API keys
          </TabsTrigger>
        </TabsList>

        {notice && <NoticeAlert message={notice} />}
        {newKey && (
          <NoticeAlert variant="warn">
            Copy your new API key now — it won&apos;t be shown again:
            <br />
            <code className="mt-1 block rounded bg-background/60 px-2 py-1 font-mono text-xs">{newKey}</code>
            <Button variant="ghost" className="mt-2" onClick={() => setNewKey(null)}>
              Dismiss
            </Button>
          </NoticeAlert>
        )}

        <TabsContent value="users" className="mt-0">
          <motion.div {...panelMotion}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <UserPlus className="h-5 w-5" />
                  Create user
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <form className="grid gap-3 sm:grid-cols-2" onSubmit={createUser}>
                  <Input label="Name" name="name" required />
                  <Input label="Email" name="email" type="email" required />
                  <Input label="Phone" name="phone" placeholder="+15551234567" />
                  <Input label="Password" name="password" type="password" required />
                  <div className="sm:col-span-2">
                    <Button type="submit">Create user</Button>
                  </div>
                </form>

                {Boolean(pendingApprovals.data?.length) && (
                  <div className="space-y-3">
                    <h4 className="font-display text-base font-semibold">Pending approvals</h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingApprovals.data.map((u) => (
                          <TableRow key={u.id}>
                            <TableCell>{u.name}</TableCell>
                            <TableCell>{u.email}</TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" onClick={() => approveUser(u)}>
                                Approve
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[220px] flex-1">
                    <Input
                      label="Search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Name or email"
                    />
                  </div>
                  <Button variant="ghost" onClick={() => users.refresh()}>
                    <RefreshCw className="mr-1.5 h-4 w-4" />
                    Refresh
                  </Button>
                </div>

                {!users.data?.length && (
                  <p className="text-sm text-muted-foreground">No users found for your organization.</p>
                )}
                {Boolean(users.data?.length) && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead>Limits</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.data.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium">{u.name}</TableCell>
                          <TableCell>{u.email}</TableCell>
                          <TableCell>{u.role}</TableCell>
                          <TableCell>{u.subscription_plan || '—'}</TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground">
                              {u.message_limit_monthly || '—'} msgs / {u.number_limit || '—'} nums
                            </span>
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={u.status} />
                          </TableCell>
                          <TableCell>
                            {u.role === 'user' && (
                              <div className="flex flex-wrap justify-end gap-1">
                                <Button variant="ghost" size="sm" onClick={() => toggleStatus(u)}>
                                  {u.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => updatePlan(u)}>
                                  Plan
                                </Button>
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
        </TabsContent>

        <TabsContent value="usage" className="mt-0">
          <motion.div {...panelMotion}>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Message usage by user</CardTitle>
              </CardHeader>
              <CardContent>
                {!usage.data?.length && (
                  <p className="text-sm text-muted-foreground">No usage data yet.</p>
                )}
                {Boolean(usage.data?.length) && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Messages</TableHead>
                        <TableHead>Delivered</TableHead>
                        <TableHead>Failed</TableHead>
                        <TableHead>Est. cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usage.data.map((row) => (
                        <TableRow key={row.user_email}>
                          <TableCell>
                            {row.user_name}
                            <br />
                            <span className="text-xs text-muted-foreground">{row.user_email}</span>
                          </TableCell>
                          <TableCell>{row.message_count}</TableCell>
                          <TableCell>{row.delivered_count}</TableCell>
                          <TableCell>{row.failed_count}</TableCell>
                          <TableCell>
                            {row.total_cost != null ? `$${Number(row.total_cost).toFixed(4)}` : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        <TabsContent value="audit" className="mt-0">
          <motion.div {...panelMotion}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-lg">Audit log</CardTitle>
                <Button variant="ghost" onClick={() => exportAudit().catch((e) => setNotice(e.message))}>
                  <Download className="mr-1.5 h-4 w-4" />
                  Export CSV (SOC2)
                </Button>
              </CardHeader>
              <CardContent>
                {!audit.data?.length && (
                  <p className="text-sm text-muted-foreground">No audit entries yet.</p>
                )}
                {Boolean(audit.data?.length) && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>When</TableHead>
                        <TableHead>Actor</TableHead>
                        <TableHead>Target</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {audit.data.map((row) => {
                        const details = typeof row.details === 'string' ? JSON.parse(row.details) : row.details;
                        const actionLabel = row.action === 'message_status_changed' && details?.toStatus
                          ? `Message ${details.fromStatus || 'new'} → ${details.toStatus}`
                          : row.action;
                        return (
                          <TableRow key={row.id}>
                            <TableCell>{new Date(row.created_at).toLocaleString()}</TableCell>
                            <TableCell>{row.actor_name || row.actor_user_id}</TableCell>
                            <TableCell>{row.target_name || row.target_user_id || '—'}</TableCell>
                            <TableCell>{actionLabel}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        <TabsContent value="branding" className="mt-0">
          <motion.div {...panelMotion}>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">White-label branding</CardTitle>
                <CardDescription>Customize your organization&apos;s appearance and retention settings.</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="max-w-md space-y-4" onSubmit={saveBranding}>
                  <div className="space-y-1.5">
                    <Label>Brand name</Label>
                    <ShadInput
                      value={brandValues.brandName || ''}
                      onChange={(e) => setBrandForm({ ...brandValues, brandName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Primary color</Label>
                    <input
                      type="color"
                      className="h-10 w-full cursor-pointer rounded-md border border-input bg-background"
                      value={brandValues.primaryColor || '#2563eb'}
                      onChange={(e) => setBrandForm({ ...brandValues, primaryColor: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Support email</Label>
                    <ShadInput
                      type="email"
                      value={brandValues.supportEmail || ''}
                      onChange={(e) => setBrandForm({ ...brandValues, supportEmail: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Message retention (days)</Label>
                    <ShadInput
                      type="number"
                      min="0"
                      value={brandValues.messageRetentionDays ?? ''}
                      onChange={(e) =>
                        setBrandForm({ ...brandValues, messageRetentionDays: Number(e.target.value) || null })
                      }
                    />
                  </div>
                  <div className="flex items-center gap-3 rounded-md border p-3">
                    <Switch
                      id="hipaa-mode"
                      checked={Boolean(brandValues.hipaaMode)}
                      onCheckedChange={(checked) => setBrandForm({ ...brandValues, hipaaMode: checked })}
                    />
                    <Label htmlFor="hipaa-mode" className="cursor-pointer font-normal">
                      HIPAA mode (enables retention audit trail)
                    </Label>
                  </div>
                  <Button type="submit">Save branding</Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        <TabsContent value="apikeys" className="mt-0">
          <motion.div {...panelMotion}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-lg">Integration API keys</CardTitle>
                  <CardDescription className="mt-1">
                    Use keys with <code className="text-xs">Authorization: Bearer smk_…</code> on{' '}
                    <code className="text-xs">/api/v1/*</code>
                  </CardDescription>
                </div>
                <Button onClick={createApiKey}>Create key</Button>
              </CardHeader>
              <CardContent>
                {!apiKeys.data?.length && (
                  <p className="text-sm text-muted-foreground">No API keys yet.</p>
                )}
                {Boolean(apiKeys.data?.length) && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Prefix</TableHead>
                        <TableHead>Scopes</TableHead>
                        <TableHead>Last used</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {apiKeys.data.map((key) => (
                        <TableRow key={key.id}>
                          <TableCell className="font-medium">{key.name}</TableCell>
                          <TableCell>
                            <code className="text-xs">{key.key_prefix}…</code>
                          </TableCell>
                          <TableCell>{(key.scopes || []).join(', ')}</TableCell>
                          <TableCell>
                            {key.last_used_at ? new Date(key.last_used_at).toLocaleString() : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="danger" size="sm" onClick={() => revokeKey(key)}>
                              Revoke
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
        </TabsContent>
      </Tabs>
    </>
  );
}
