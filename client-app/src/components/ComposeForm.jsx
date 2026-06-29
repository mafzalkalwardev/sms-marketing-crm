import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import useAsync from '../hooks/useAsync';
import Button from './Button';
import Dialpad from './Dialpad';
import SaveContactBar from './SaveContactBar';
import { formatStatus } from '../lib/formatStatus';
import { isSavedContact } from '../lib/contactUtils';

export default function ComposeForm({ initialTo = '', onSent, onCancel, onContactSaved }) {
  const contacts = useAsync(() => api('/api/contacts'), []);
  const numbers = useAsync(() => api('/api/numbers'), []);
  const [form, setForm] = useState({ from: '', to: initialTo, message: '', saveName: '' });
  const [showKeypad, setShowKeypad] = useState(false);
  const [status, setStatus] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingSave, setPendingSave] = useState(null);

  const defaultNumber = useMemo(
    () => numbers.data?.find((n) => n.is_default) || numbers.data?.[0],
    [numbers.data]
  );

  useEffect(() => {
    if (defaultNumber && !form.from) {
      setForm((current) => ({ ...current, from: defaultNumber.phone_number }));
    }
  }, [defaultNumber, form.from]);

  useEffect(() => {
    if (initialTo) setForm((current) => ({ ...current, to: initialTo }));
  }, [initialTo]);

  const selected = contacts.data?.find((c) => c.phone === form.to);
  const isNewNumber = Boolean(form.to) && !isSavedContact({ phone: form.to, name: selected?.name });
  const canSend = Boolean(form.from && form.to && form.message.trim() && !selected?.is_unsubscribed);

  const saveBeforeSend = async (phone, name) => {
    if (!name.trim()) return;
    await api('/api/contacts/save-from-conversation', {
      method: 'POST',
      body: { phone, name: name.trim() },
    });
    contacts.refresh();
    onContactSaved?.();
  };

  const send = async (event) => {
    event.preventDefault();
    setSending(true);
    setStatus('');
    setPendingSave(null);
    try {
      if (isNewNumber && form.saveName.trim()) {
        await saveBeforeSend(form.to, form.saveName);
      }

      const result = await api('/api/manual-sms/send', { method: 'POST', body: form });
      setStatus(`Sent · ${formatStatus(result.status)}`);
      setForm((current) => ({ ...current, message: '', saveName: '' }));

      const stillUnsaved = !form.saveName.trim() && !isSavedContact({ phone: form.to, name: selected?.name });
      if (stillUnsaved) {
        setPendingSave({ phone: form.to, conversationId: result.conversationId });
      }

      contacts.refresh();
      onSent?.(result);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <form className="compose-form" onSubmit={send}>
      {!numbers.data?.length && (
        <div className="alert warn">Add a phone number under <strong>My numbers</strong> before sending.</div>
      )}

      <label className="field">
        <span>Send from</span>
        <select value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} required>
          <option value="">Choose your number</option>
          {numbers.data?.map((n) => (
            <option key={n.id} value={n.phone_number}>
              {n.label ? `${n.label} — ` : ''}{n.phone_number}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>To</span>
        <input
          value={form.to}
          onChange={(e) => {
            setPendingSave(null);
            setForm({ ...form, to: e.target.value });
          }}
          placeholder="Type a number or pick a contact"
          list="compose-contacts"
          required
        />
        <datalist id="compose-contacts">
          {contacts.data?.filter((c) => isSavedContact(c)).map((c) => (
            <option key={c.id} value={c.phone}>{c.name}</option>
          ))}
        </datalist>
      </label>

      {isNewNumber && (
        <label className="field save-name-field">
          <span>Save to contacts (optional)</span>
          <input
            value={form.saveName}
            onChange={(e) => setForm({ ...form, saveName: e.target.value })}
            placeholder="Name for this number"
          />
        </label>
      )}

      <div className="compose-quick-picks">
        {contacts.data?.filter((c) => isSavedContact(c)).slice(0, 8).map((c) => (
          <button
            key={c.id}
            type="button"
            className={`chip ${form.to === c.phone ? 'active' : ''}`}
            onClick={() => {
              setPendingSave(null);
              setForm({ ...form, to: c.phone, saveName: '' });
            }}
          >
            {c.name}
          </button>
        ))}
      </div>

      <button type="button" className="text-btn" onClick={() => setShowKeypad((v) => !v)}>
        {showKeypad ? 'Hide keypad' : 'Use number keypad'}
      </button>
      {showKeypad && (
        <div className="keypad-wrap">
          <Dialpad value={form.to} onChange={(to) => setForm({ ...form, to })} />
          <div className="dialer-actions">
            <Button type="button" variant="ghost" onClick={() => setForm({ ...form, to: form.to.slice(0, -1) })}>Delete</Button>
            <Button type="button" variant="ghost" onClick={() => setForm({ ...form, to: '' })}>Clear</Button>
          </div>
        </div>
      )}

      <label className="field">
        <span>Message</span>
        <textarea
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          placeholder="Write your text here..."
          rows={4}
          required
        />
      </label>

      {selected?.is_unsubscribed && (
        <div className="alert error">This contact unsubscribed. You can’t text them.</div>
      )}

      {status && (
        <div className={status.startsWith('Sent') ? 'alert success' : 'alert error'}>{status}</div>
      )}

      {pendingSave && (
        <SaveContactBar
          phone={pendingSave.phone}
          conversationId={pendingSave.conversationId}
          onSaved={() => {
            setPendingSave(null);
            contacts.refresh();
            onContactSaved?.();
          }}
        />
      )}

      <div className="compose-actions">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button className="send-btn" disabled={!canSend || sending}>
          {sending ? 'Sending…' : 'Send message'}
        </Button>
      </div>
    </form>
  );
}
