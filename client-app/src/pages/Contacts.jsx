import { useMemo, useState } from 'react';
import { api } from '../api/client';
import useAsync from '../hooks/useAsync';
import Topbar from '../components/Topbar';
import Button from '../components/Button';
import Input from '../components/Input';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input as ShadInput } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

function consentBadgeVariant(status) {
  if (status === 'opted_in') return 'success';
  if (status === 'unsubscribed') return 'destructive';
  return 'secondary';
}

export default function Contacts({ setPage }) {
  const [query, setQuery] = useState({ search: '', country: '', consent: '', unsubscribed: '' });
  const [modal, setModal] = useState(null);
  const params = useMemo(() => new URLSearchParams(Object.entries(query).filter(([, value]) => value)).toString(), [query]);
  const contacts = useAsync(() => api(`/api/contacts${params ? `?${params}` : ''}`), [params]);

  const save = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    body.is_unsubscribed = form.get('is_unsubscribed') === 'on';
    if (modal?.id) await api(`/api/contacts/${modal.id}`, { method: 'PUT', body });
    else await api('/api/contacts', { method: 'POST', body });
    setModal(null);
    contacts.refresh();
  };

  const remove = async (id) => {
    await api(`/api/contacts/${id}`, { method: 'DELETE' });
    contacts.refresh();
  };

  const messageContact = async (contact) => {
    await api('/api/conversations/start', { method: 'POST', body: { phone: contact.phone, name: contact.name } });
    if (setPage) setPage('messages');
  };

  return (
    <div className="space-y-4 pb-20 md:pb-6">
      <Topbar
        title="Contacts"
        subtitle="People you text — saved names show in your inbox."
        action={<Button onClick={() => setModal({})}>+ Add contact</Button>}
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="min-w-[200px] flex-1 space-y-1.5">
            <Label className="text-muted-foreground">Search</Label>
            <ShadInput
              placeholder="Search name, phone, email"
              value={query.search}
              onChange={(e) => setQuery({ ...query, search: e.target.value })}
            />
          </div>
          <div className="min-w-[140px] space-y-1.5">
            <Label className="text-muted-foreground">Country</Label>
            <select
              className={selectClassName}
              value={query.country}
              onChange={(e) => setQuery({ ...query, country: e.target.value })}
            >
              <option value="">All countries</option>
              <option>US</option>
              <option>UK</option>
            </select>
          </div>
          <div className="min-w-[140px] space-y-1.5">
            <Label className="text-muted-foreground">Consent</Label>
            <select
              className={selectClassName}
              value={query.consent}
              onChange={(e) => setQuery({ ...query, consent: e.target.value })}
            >
              <option value="">All consent</option>
              <option value="opted_in">Opted in</option>
              <option value="unknown">Unknown</option>
              <option value="unsubscribed">Unsubscribed</option>
            </select>
          </div>
          <div className="min-w-[140px] space-y-1.5">
            <Label className="text-muted-foreground">Status</Label>
            <select
              className={selectClassName}
              value={query.unsubscribed}
              onChange={(e) => setQuery({ ...query, unsubscribed: e.target.value })}
            >
              <option value="">All statuses</option>
              <option value="false">Can message</option>
              <option value="true">Unsubscribed</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {contacts.error && (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {contacts.error}
            </div>
          )}
          {!contacts.loading && !contacts.data?.length && (
            <EmptyState title="No contacts found" text="Add opted-in contacts before sending messages or campaigns." />
          )}
          {Boolean(contacts.data?.length) && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Consent</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.data.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell className="font-medium">{contact.name || '—'}</TableCell>
                    <TableCell>{contact.phone}</TableCell>
                    <TableCell>{contact.country}</TableCell>
                    <TableCell>
                      <Badge variant={consentBadgeVariant(contact.consent_status)}>
                        {contact.consent_status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {contact.is_unsubscribed ? (
                        <Badge variant="destructive">unsubscribed</Badge>
                      ) : (
                        <Badge variant="success">active</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => messageContact(contact)}>Message</Button>
                        <Button variant="ghost" size="sm" onClick={() => navigator.clipboard?.writeText(contact.phone)}>Copy</Button>
                        <Button variant="ghost" size="sm" onClick={() => setModal(contact)}>Edit</Button>
                        <Button variant="danger" size="sm" onClick={() => remove(contact.id)}>Delete</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {modal && (
        <Modal title={modal.id ? 'Edit contact' : 'Add contact'} onClose={() => setModal(null)}>
          <form className="space-y-4" onSubmit={save}>
            <Input label="Name" name="name" defaultValue={modal.name || ''} />
            <Input label="Phone" name="phone" defaultValue={modal.phone || ''} required placeholder="+15551234567" />
            <Input label="Email" name="email" defaultValue={modal.email || ''} />
            <Input label="Tags" name="tags" defaultValue={modal.tags || ''} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Country">
                <select name="country" defaultValue={modal.country || 'US'} className={selectClassName}>
                  <option>US</option>
                  <option>UK</option>
                </select>
              </Input>
              <Input label="Consent">
                <select name="consent_status" defaultValue={modal.consent_status || 'unknown'} className={selectClassName}>
                  <option value="unknown">Unknown</option>
                  <option value="opted_in">Opted in</option>
                  <option value="unsubscribed">Unsubscribed</option>
                </select>
              </Input>
            </div>
            <Input label="Consent source" name="consent_source" defaultValue={modal.consent_source || 'manual'} />
            <label className="flex items-center gap-2 text-sm">
              <input
                name="is_unsubscribed"
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                defaultChecked={Boolean(modal.is_unsubscribed)}
              />
              Unsubscribed
            </label>
            <Button>Save contact</Button>
          </form>
        </Modal>
      )}
    </div>
  );
}
