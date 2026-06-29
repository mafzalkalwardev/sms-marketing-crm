import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import useAsync from '../hooks/useAsync';
import Button from './Button';
import Dialpad from './Dialpad';
import MessageBubble from './MessageBubble';
import EmptyState from './EmptyState';
import { formatStatus, segments } from '../lib/formatStatus';

export default function DialerWorkspace({ compact = false, initialTo = '', onSent }) {
  const contacts = useAsync(() => api('/api/contacts'), []);
  const numbers = useAsync(() => api('/api/numbers'), []);
  const [form, setForm] = useState({ from: '', to: initialTo, message: '' });
  const [history, setHistory] = useState([]);
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

  const selected = contacts.data?.find((contact) => contact.phone === form.to);
  const canSend = Boolean(form.to && form.message.trim() && !selected?.is_unsubscribed && form.from);
  const segmentCount = segments(form.message);
  const estimatedCost = useMemo(() => (segmentCount * 0.008).toFixed(4), [segmentCount]);

  const loadHistory = async (phone) => {
    if (!phone) return setHistory([]);
    try {
      setHistory(await api(`/api/manual-sms/history/${encodeURIComponent(phone)}`));
    } catch {
      setHistory([]);
    }
  };

  const updateTo = (to) => {
    setForm((current) => ({ ...current, to }));
    loadHistory(to);
  };

  const send = async (event) => {
    event.preventDefault();
    setSending(true);
    setStatus('Sending...');
    try {
      const result = await api('/api/manual-sms/send', { method: 'POST', body: form });
      setStatus(`Message ${formatStatus(result.status)}`);
      setForm((current) => ({ ...current, message: '' }));
      await loadHistory(form.to);
      onSent?.(result);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <section className={`dialer-workspace ${compact ? 'compact' : ''}`}>
      <aside className="panel dialer-rail">
        <div className="line-card">
          <span className="line-dot" />
          <div>
            <strong>Business line</strong>
            <small>{form.from || 'Add a sender number in Numbers'}</small>
          </div>
        </div>
        <label className="field">
          <span>From</span>
          <select value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} required>
            <option value="">Select sender</option>
            {numbers.data?.map((n) => (
              <option key={n.id} value={n.phone_number}>
                {n.label ? `${n.label} · ` : ''}{n.phone_number}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>To</span>
          <input value={form.to} onChange={(e) => updateTo(e.target.value)} placeholder="+15551234567" />
        </label>
        <label className="field">
          <span>Contact</span>
          <select value="" onChange={(e) => updateTo(e.target.value)}>
            <option value="">Choose contact</option>
            {contacts.data?.map((c) => (
              <option key={c.id} value={c.phone}>{c.name || c.phone} · {c.phone}</option>
            ))}
          </select>
        </label>
        <Dialpad value={form.to} onChange={updateTo} />
        <div className="dialer-actions">
          <Button type="button" variant="ghost" onClick={() => updateTo(form.to.slice(0, -1))}>Backspace</Button>
          <Button type="button" variant="ghost" onClick={() => updateTo('')}>Clear</Button>
        </div>
      </aside>

      <form className="panel dialer-screen" onSubmit={send}>
        <div className="dialer-header">
          <div className="avatar">{(selected?.name || form.to || '#').charAt(0).toUpperCase()}</div>
          <div className="dialer-header-text">
            <h3>{selected?.name || form.to || 'New conversation'}</h3>
            <span>{selected?.phone || (form.to ? form.to : 'Enter a number to start')}</span>
          </div>
          <span className={`badge ${selected?.is_unsubscribed ? 'danger' : 'active'}`}>
            {selected?.is_unsubscribed ? 'Unsubscribed' : 'Ready'}
          </span>
        </div>

        {selected?.is_unsubscribed && (
          <div className="alert error">This contact is unsubscribed. Sending is blocked until they opt in again.</div>
        )}
        {!numbers.data?.length && (
          <div className="alert">Add a sender number under Numbers before sending texts.</div>
        )}

        <div className="thread">
          {!history.length && (
            <EmptyState title="No messages yet" text="Send your first text to start this conversation." />
          )}
          {history.map((message) => <MessageBubble key={message.id} message={message} />)}
          {form.message && (
            <MessageBubble message={{ direction: 'outbound', message_body: form.message, status: 'draft' }} />
          )}
        </div>

        <div className="composer">
          <textarea
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            placeholder="Type your message..."
            required
          />
          <div className="composer-footer">
            <span>{form.message.length} chars · {segmentCount || 0} segment{segmentCount === 1 ? '' : 's'} · est. ${estimatedCost}</span>
            <Button disabled={!canSend || sending}>{sending ? 'Sending...' : 'Send'}</Button>
          </div>
        </div>
        {status && (
          <div className={status.startsWith('Message') ? 'alert success' : status === 'Sending...' ? 'alert' : 'alert error'}>
            {status}
          </div>
        )}
      </form>

      {!compact && (
        <aside className="panel dialer-sidebar">
          <h3>Contact</h3>
          <div className="profile-card">
            <div className="avatar large">{(selected?.name || form.to || '?').charAt(0).toUpperCase()}</div>
            <strong>{selected?.name || 'Unknown contact'}</strong>
            <span>{form.to || 'No number selected'}</span>
          </div>
          <div className="check-list">
            <span>STOP replies auto-suppress future sends</span>
            <span>Delivery updates appear in the thread</span>
            <span>Assign numbers per user in Admin</span>
          </div>
        </aside>
      )}
    </section>
  );
}
