import { useMemo, useState } from 'react';
import { api } from '../api/client';
import useAsync from '../hooks/useAsync';
import Topbar from '../components/Topbar';
import Button from '../components/Button';
import Input from '../components/Input';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';

export default function Contacts() {
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

  return (
    <>
      <Topbar title="Contacts" subtitle="CRM and consent" action={<Button onClick={() => setModal({})}>Add contact</Button>} />
      <section className="filters">
        <input placeholder="Search name, phone, email" value={query.search} onChange={(e) => setQuery({ ...query, search: e.target.value })} />
        <select value={query.country} onChange={(e) => setQuery({ ...query, country: e.target.value })}><option value="">All countries</option><option>US</option><option>UK</option></select>
        <select value={query.consent} onChange={(e) => setQuery({ ...query, consent: e.target.value })}><option value="">All consent</option><option value="opted_in">Opted in</option><option value="unknown">Unknown</option><option value="unsubscribed">Unsubscribed</option></select>
        <select value={query.unsubscribed} onChange={(e) => setQuery({ ...query, unsubscribed: e.target.value })}><option value="">All statuses</option><option value="false">Can message</option><option value="true">Unsubscribed</option></select>
      </section>
      <section className="panel table-panel">
        {contacts.error && <div className="alert error">{contacts.error}</div>}
        {!contacts.loading && !contacts.data?.length && <EmptyState title="No contacts found" text="Add opted-in contacts before sending messages or campaigns." />}
        {Boolean(contacts.data?.length) && (
          <table>
            <thead><tr><th>Name</th><th>Phone</th><th>Country</th><th>Consent</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {contacts.data.map((contact) => (
                <tr key={contact.id}>
                  <td>{contact.name || '-'}</td>
                  <td>{contact.phone}</td>
                  <td>{contact.country}</td>
                  <td><span className={`badge ${contact.consent_status}`}>{contact.consent_status}</span></td>
                  <td>{contact.is_unsubscribed ? <span className="badge danger">unsubscribed</span> : <span className="badge active">active</span>}</td>
                  <td className="row-actions"><Button variant="ghost" onClick={() => setModal(contact)}>Edit</Button><Button variant="danger" onClick={() => remove(contact.id)}>Delete</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {modal && (
        <Modal title={modal.id ? 'Edit contact' : 'Add contact'} onClose={() => setModal(null)}>
          <form className="stack" onSubmit={save}>
            <Input label="Name" name="name" defaultValue={modal.name || ''} />
            <Input label="Phone" name="phone" defaultValue={modal.phone || ''} required placeholder="+15551234567" />
            <Input label="Email" name="email" defaultValue={modal.email || ''} />
            <Input label="Tags" name="tags" defaultValue={modal.tags || ''} />
            <div className="form-row">
              <Input label="Country"><select name="country" defaultValue={modal.country || 'US'}><option>US</option><option>UK</option></select></Input>
              <Input label="Consent"><select name="consent_status" defaultValue={modal.consent_status || 'unknown'}><option value="unknown">Unknown</option><option value="opted_in">Opted in</option><option value="unsubscribed">Unsubscribed</option></select></Input>
            </div>
            <Input label="Consent source" name="consent_source" defaultValue={modal.consent_source || 'manual'} />
            <label className="checkbox"><input name="is_unsubscribed" type="checkbox" defaultChecked={Boolean(modal.is_unsubscribed)} /> Unsubscribed</label>
            <Button>Save contact</Button>
          </form>
        </Modal>
      )}
    </>
  );
}
