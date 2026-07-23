import { useState } from 'react';
import { api, API_BASE } from '../api/client';
import useAsync from '../hooks/useAsync';
import Topbar from '../components/Topbar';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import StatCard from '../components/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CheckCircle2 } from 'lucide-react';

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
    <div className="space-y-6 pb-20 md:pb-6">
      <Topbar
        title="Compliance"
        subtitle="Opt-outs, suppression list, and sending rules"
        action={<Button variant="ghost" disabled={exporting} onClick={exportCsv}>Export CSV</Button>}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Suppressed numbers" value={summary.data?.suppressedNumbers ?? '—'} />
        <StatCard label="Unsubscribed contacts" value={summary.data?.unsubscribedContacts ?? '—'} />
        <StatCard label="Opted in" value={summary.data?.optedInContacts ?? '—'} />
        <StatCard label="STOP messages" value={summary.data?.inboundStopMessages ?? '—'} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>How it works</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5">
              {[
                'Send only to opted-in contacts.',
                'Include opt-out language in marketing texts.',
                'STOP replies auto-unsubscribe the contact and add them to suppression.',
                'Future sends to suppressed numbers are blocked.',
                'Campaign previews exclude suppressed contacts.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Opt-out keywords</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {keywords.map((keyword) => (
                <Badge key={keyword} variant="secondary">{keyword}</Badge>
              ))}
            </div>
            <div>
              <h4 className="mb-2 text-sm font-semibold">Regional notes</h4>
              <p className="text-sm text-muted-foreground">
                US A2P 10DLC and UK sender-ID rules may apply depending on your use case. Your platform operator configures dialer backends.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Suppression list</CardTitle>
        </CardHeader>
        <CardContent>
          {!suppressions.data?.length && (
            <EmptyState title="No suppressions yet" text="When someone replies STOP, they appear here automatically." />
          )}
          {Boolean(suppressions.data?.length) && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phone</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppressions.data.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.phone}</TableCell>
                    <TableCell>{row.reason || '—'}</TableCell>
                    <TableCell>{row.source || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</TableCell>
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
