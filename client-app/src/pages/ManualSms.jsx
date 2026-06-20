import { useMemo, useState } from 'react';
import { api } from '../api/client';
import useAsync from '../hooks/useAsync';
import Topbar from '../components/Topbar';
import Button from '../components/Button';
import Dialpad from '../components/Dialpad';
import MessageBubble from '../components/MessageBubble';

function segments(text) {
  return text.length <= 160 ? 1 : Math.ceil(text.length / 153);
}

export default function ManualSms() {
  const contacts = useAsync(() => api('/api/contacts'), []);
  const numbers = useAsync(() => api('/api/numbers'), []);
  const [form, setForm] = useState({ from: '', to: '', message: '' });
  const [history, setHistory] = useState([]);
  const [status, setStatus] = useState('');
  const selected = contacts.data?.find((contact) => contact.phone === form.to);
  const canSend = !selected?.is_unsubscribed;
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
    setStatus('Sending...');
    try {
      const result = await api('/api/manual-sms/send', { method: 'POST', body: form });
      setStatus(result.mode === 'mock' ? 'Mock SMS sent - configure Vonage for real delivery' : `Message ${result.status}`);
      setForm((current) => ({ ...current, message: '' }));
      loadHistory(form.to);
    } catch (error) {
      setStatus(error.message);
    }
  };

  return (
    <>
      <Topbar title="Manual SMS" subtitle="Dialpad-style business texting" />
      <section className="phone-workspace">
        <aside className="panel phone-rail">
          <div className="line-card"><span className="line-dot" /><div><strong>Main business line</strong><small>{form.from || 'Mock sender'}</small></div></div>
          <label className="field"><span>Sender number</span><select value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })}><option value="">Default sender</option>{numbers.data?.map((n) => <option key={n.id} value={n.phone_number}>{n.phone_number}</option>)}</select></label>
          <label className="field"><span>Recipient</span><input value={form.to} onChange={(e) => updateTo(e.target.value)} placeholder="+15551234567" /></label>
          <label className="field"><span>Contact picker</span><select value="" onChange={(e) => updateTo(e.target.value)}><option value="">Choose contact</option>{contacts.data?.map((c) => <option key={c.id} value={c.phone}>{c.name || c.phone} - {c.phone}</option>)}</select></label>
          <Dialpad value={form.to} onChange={updateTo} />
          <Button variant="ghost" onClick={() => updateTo(form.to.slice(0, -1))}>Backspace</Button>
        </aside>
        <form className="panel phone-screen" onSubmit={send}>
          <div className="phone-header">
            <div className="avatar">{(selected?.name || form.to || '#').charAt(0).toUpperCase()}</div>
            <div><h3>{selected?.name || form.to || 'New conversation'}</h3><span>{selected?.phone || 'Enter a number to start'}</span></div>
            <span className={`badge ${selected?.is_unsubscribed ? 'danger' : 'active'}`}>{selected?.is_unsubscribed ? 'unsubscribed' : 'messageable'}</span>
          </div>
          {selected?.is_unsubscribed && <div className="alert error">This contact is unsubscribed. Sending is blocked until they opt in again.</div>}
          <div className="thread">
            {!history.length && <div className="empty-state"><strong>No messages yet</strong><p>Send a mock SMS to create the first message in this thread.</p></div>}
            {history.map((message) => <MessageBubble key={message.id} message={message} />)}
            {form.message && <MessageBubble message={{ direction: 'outbound', message_body: form.message, status: 'draft' }} />}
          </div>
          <div className="composer">
            <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Type a text message..." required />
            <div className="composer-footer">
              <span>{form.message.length} chars · {segmentCount} segments · est. ${estimatedCost}</span>
              <Button disabled={!canSend}>Send SMS</Button>
            </div>
          </div>
          {status && <div className={status.startsWith('Mock') || status.startsWith('Message') ? 'alert success' : 'alert'}>{status}</div>}
        </form>
        <aside className="panel contact-sidebar">
          <h3>Contact details</h3>
          <div className="profile-card"><div className="avatar large">{(selected?.name || form.to || '?').charAt(0).toUpperCase()}</div><strong>{selected?.name || 'Unknown contact'}</strong><span>{form.to || 'No number selected'}</span></div>
          <div className="check-list"><span>STOP replies auto-suppress future sends</span><span>Mock mode is safe for local tests</span><span>Delivery webhooks update status badges</span></div>
        </aside>
      </section>
    </>
  );
}
