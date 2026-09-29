import { useState } from 'react';
import { api, API_BASE } from '../api/client';
import useAsync from '../hooks/useAsync';
import Topbar from '../components/Topbar';
import Button from '../components/Button';
import Input from '../components/Input';
import EmptyState from '../components/EmptyState';
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

const selectClassName =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Numbers() {
  const numbers = useAsync(() => api('/api/numbers'), []);
  const esimProfiles = useAsync(() => api('/api/esim/profiles'), []);
  const [esimForm, setEsimForm] = useState({ phoneNumber: '', lpa: '', label: '' });
  const [qrFile, setQrFile] = useState(null);
  const [esimBusy, setEsimBusy] = useState(false);
  const [esimNotice, setEsimNotice] = useState('');
  const [pairingById, setPairingById] = useState({});

  const create = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = Object.fromEntries(form.entries());
    body.is_default = form.get('is_default') === 'on';
    await api('/api/numbers', { method: 'POST', body });
    formElement.reset();
    numbers.refresh();
  };

  const setDefault = async (number) => {
    await api(`/api/numbers/${number.id}`, { method: 'PUT', body: { ...number, is_default: true } });
    numbers.refresh();
  };

  const remove = async (id) => {
    await api(`/api/numbers/${id}`, { method: 'DELETE' });
    numbers.refresh();
  };

  const connectEsim = async (event) => {
    event.preventDefault();
    setEsimBusy(true);
    setEsimNotice('');
    try {
      const body = {
        phone_number: esimForm.phoneNumber,
        lpa: esimForm.lpa || undefined,
        label: esimForm.label || 'eSIM line',
      };
      if (qrFile) {
        body.qrImageBase64 = await fileToBase64(qrFile);
      }
      if (!body.lpa && !body.qrImageBase64) {
        throw new Error('Upload an eSIM QR image or paste the LPA activation string.');
      }
      await api('/api/esim/profiles', { method: 'POST', body });
      setEsimForm({ phoneNumber: '', lpa: '', label: '' });
      setQrFile(null);
      setEsimNotice('eSIM connected. Install it on your Android phone, then generate a pairing code.');
      numbers.refresh();
      esimProfiles.refresh();
    } catch (error) {
      setEsimNotice(error.message || 'Failed to connect eSIM');
    } finally {
      setEsimBusy(false);
    }
  };

  const mintPairingCode = async (profileId) => {
    setEsimBusy(true);
    setEsimNotice('');
    try {
      const result = await api(`/api/esim/profiles/${profileId}/pairing-code`, { method: 'POST' });
      setPairingById((current) => ({ ...current, [profileId]: result }));
      esimProfiles.refresh();
    } catch (error) {
      setEsimNotice(error.message || 'Failed to create pairing code');
    } finally {
      setEsimBusy(false);
    }
  };

  const removeEsim = async (profileId) => {
    await api(`/api/esim/profiles/${profileId}`, { method: 'DELETE' });
    setPairingById((current) => {
      const next = { ...current };
      delete next[profileId];
      return next;
    });
    numbers.refresh();
    esimProfiles.refresh();
  };

  const profiles = esimProfiles.data?.profiles || [];

  return (
    <div className="space-y-4 pb-20 md:pb-6">
      <Topbar title="My numbers" subtitle="Add sender numbers or connect an eSIM for manual SMS." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Connect eSIM</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={connectEsim}>
              <Input
                label="eSIM phone number"
                required
                placeholder="+15551234567"
                value={esimForm.phoneNumber}
                onChange={(event) => setEsimForm((current) => ({ ...current, phoneNumber: event.target.value }))}
              />
              <Input
                label="Label"
                placeholder="My Android eSIM"
                value={esimForm.label}
                onChange={(event) => setEsimForm((current) => ({ ...current, label: event.target.value }))}
              />
              <Input label="eSIM QR image">
                <input
                  type="file"
                  accept="image/*"
                  className="block w-full text-sm"
                  onChange={(event) => setQrFile(event.target.files?.[0] || null)}
                />
              </Input>
              <Input
                label="Or paste LPA activation code"
                placeholder="LPA:1$smdp.example.com$ACTIVATION-CODE"
                value={esimForm.lpa}
                onChange={(event) => setEsimForm((current) => ({ ...current, lpa: event.target.value }))}
              />
              <p className="text-sm text-muted-foreground">
                Install the eSIM on an Android phone, then pair the SignalMint eSIM Agent. Agent API base:
                {' '}
                <code className="text-xs">{API_BASE}/api/esim-agent</code>
              </p>
              {esimNotice && <p className="text-sm text-muted-foreground">{esimNotice}</p>}
              <Button disabled={esimBusy}>{esimBusy ? 'Working…' : 'Connect eSIM'}</Button>
            </form>

            {Boolean(profiles.length) && (
              <div className="mt-6 space-y-3">
                <h3 className="text-sm font-medium">Your eSIM profiles</h3>
                {profiles.map((profile) => {
                  const pairing = pairingById[profile.id];
                  return (
                    <div key={profile.id} className="rounded-md border border-border p-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-medium">{profile.phoneNumber}</div>
                          <div className="text-xs text-muted-foreground">{profile.label || 'eSIM line'}</div>
                        </div>
                        <Badge variant={profile.status === 'active' || profile.status === 'paired' ? 'default' : 'secondary'}>
                          {profile.status}
                        </Badge>
                      </div>
                      {pairing?.pairingCode && (
                        <div className="rounded bg-muted p-2 text-sm">
                          Pairing code: <strong className="tracking-widest">{pairing.pairingCode}</strong>
                          <div className="text-xs text-muted-foreground mt-1">Expires in about 15 minutes. Enter it in the Android agent.</div>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="ghost" disabled={esimBusy} onClick={() => mintPairingCode(profile.id)}>
                          Pairing code
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => removeEsim(profile.id)}>
                          Remove
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add sender number</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={create}>
              <Input label="Phone number" name="phone_number" required placeholder="+15551234567" />
              <Input label="Label" name="label" placeholder="Sales line" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Country">
                  <select name="country" defaultValue="US" className={selectClassName}>
                    <option>US</option>
                    <option>UK</option>
                  </select>
                </Input>
                <Input label="Type">
                  <select name="type" defaultValue="long-code" className={selectClassName}>
                    <option value="long-code">Long code</option>
                    <option value="toll-free">Toll-free</option>
                    <option value="esim">eSIM</option>
                  </select>
                </Input>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input name="is_default" type="checkbox" className="h-4 w-4 rounded border-input" />
                Default sender
              </label>
              <Button>Add number</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active senders</CardTitle>
        </CardHeader>
        <CardContent>
          {!numbers.data?.length && (
            <EmptyState title="No numbers yet" text="Connect an eSIM or add a business sender number to start texting." />
          )}
          {Boolean(numbers.data?.length) && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {numbers.data.map((number) => (
                  <TableRow key={number.id}>
                    <TableCell className="font-medium">{number.phone_number}</TableCell>
                    <TableCell>{number.label || '—'}</TableCell>
                    <TableCell>{number.country}</TableCell>
                    <TableCell>
                      <Badge variant={number.is_default ? 'default' : 'secondary'}>
                        {number.is_default ? 'default' : number.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setDefault(number)}>Default</Button>
                        <Button variant="danger" size="sm" onClick={() => remove(number.id)}>Delete</Button>
                      </div>
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
