import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import useAsync from '../hooks/useAsync';
import Button from './Button';
import Dialpad from './Dialpad';
import { formatStatus } from '../lib/formatStatus';

export default function ComposeForm({ initialTo = '', onSent, onCancel }) {
  const contacts = useAsync(() => api('/api/contacts'), []);
  const numbers = useAsync(() => api('/api/numbers'), []);
  const [form, setForm] = useState({ from: '', to: initialTo, message: '' });
  const [showKeypad, setShowKeypad] = useState(false);
  const [status, setStatus] = useState('');
  const [sending, setSending] = useState(false);

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
  const canSend = Boolean(form.from && form.to && form.message.trim() && !selected?.is_unsubscribed);

  const send = async (event) => {
    event.preventDefault();
    setSending(true);
    setStatus('');
    try {
      const result = await api('/api/manual-sms/send', { method: 'POST', body: form });
      setStatus(`Sent · ${formatStatus(result.status)}`);
      setForm((current) => ({ ...current, message: '' }));
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
          onChange={(e) => setForm({ ...form, to: e.target.value })}
          placeholder="Type a number or pick a contact below"
          list="compose-contacts"
          required
        />
        <datalist id="compose-contacts">
          {contacts.data?.map((c) => (
            <option key={c.id} value={c.phone}>{c.name || c.phone}</option>
          ))}
        </datalist>
      </label>

      <div className="compose-quick-picks">
        {contacts.data?.slice(0, 6).map((c) => (
          <button
            key={c.id}
            type="button"
            className={`chip ${form.to === c.phone ? 'active' : ''}`}
            onClick={() => setForm({ ...form, to: c.phone })}
          >
            {c.name || c.phone}
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

      <div className="compose-actions">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button className="send-btn" disabled={!canSend || sending}>
          {sending ? 'Sending…' : 'Send message'}
        </Button>
      </div>
    </form>
  );
}
