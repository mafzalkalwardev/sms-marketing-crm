import { useMemo, useState } from 'react';
import { api } from '../api/client';
import useAsync from '../hooks/useAsync';
import Topbar from '../components/Topbar';
import StatCard from '../components/StatCard';
import Button from '../components/Button';
import { formatStatus } from '../lib/formatStatus';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

const selectClassName =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

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
    <div className="space-y-6 pb-20 md:pb-6">
      <Topbar title="Reports" subtitle="Delivery, replies, and estimated cost" />

      {dashboard.error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {dashboard.error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Date range</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">Direction</Label>
              <select
                className={cn(selectClassName, 'min-w-[140px]')}
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
              >
                <option value="all">All</option>
                <option value="outbound">Outbound</option>
                <option value="inbound">Inbound</option>
              </select>
            </div>
            <Button onClick={refresh}>Apply</Button>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Outbound" value={dashboard.data?.outbound ?? '…'} />
        <StatCard label="Delivered" value={dashboard.data?.delivered ?? '…'} />
        <StatCard label="Delivery rate" value={`${dashboard.data?.deliveryRate || 0}%`} />
        <StatCard label="Reply rate" value={`${dashboard.data?.replyRate || 0}%`} />
        <StatCard label="Failed" value={dashboard.data?.failed ?? '…'} />
        <StatCard label="Est. cost" value={`$${dashboard.data?.totalCost ?? 0}`} />
        <StatCard label="Mode" value={dashboard.data?.providerMode || 'sandbox'} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Message log</CardTitle>
        </CardHeader>
        <CardContent>
          {!messages.data?.length && (
            <p className="text-sm text-muted-foreground">No messages in this range.</p>
          )}
          {Boolean(messages.data?.length) && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Body</TableHead>
                  <TableHead>Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages.data.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</TableCell>
                    <TableCell>{row.contact_name || row.to_number || row.from_number}</TableCell>
                    <TableCell>{row.direction}</TableCell>
                    <TableCell>{formatStatus(row.status)}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{row.message_body}</TableCell>
                    <TableCell>
                      {row.cost_estimate != null ? `$${Number(row.cost_estimate).toFixed(4)}` : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
