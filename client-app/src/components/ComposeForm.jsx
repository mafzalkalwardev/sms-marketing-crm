import { useEffect, useState } from 'react';
import { api } from '../api/client';
import useAsync from '../hooks/useAsync';
import useWorkspace from '../hooks/useWorkspace';
import Button from './Button';
import Dialpad from './Dialpad';
import LinePicker from './LinePicker';
import SaveContactBar from './SaveContactBar';
import { formatStatus } from '../lib/formatStatus';
import { isSavedContact } from '../lib/contactUtils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export default function ComposeForm({ initialTo = '', onSent, onCancel, onContactSaved }) {
  const contacts = useAsync(() => api('/api/contacts'), []);
  const workspace = useWorkspace();
  const lines = workspace.data?.lines || [];
  const [form, setForm] = useState({ from: '', to: initialTo, message: '', saveName: '' });
  const [showKeypad, setShowKeypad] = useState(false);
  const [status, setStatus] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingSave, setPendingSave] = useState(null);

  useEffect(() => {
    if (workspace.data?.defaultLine && !form.from) {
      setForm((current) => ({ ...current, from: workspace.data.defaultLine }));
    }
  }, [workspace.data, form.from]);

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
    <form className="space-y-4" onSubmit={send}>
      {!workspace.data?.messagingReady && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          Add a business line under <strong>My numbers</strong> to send from any dialer backend.
        </div>
      )}

      <LinePicker lines={lines} value={form.from} onChange={(from) => setForm({ ...form, from })} />

      <div className="space-y-1.5">
        <Label>To</Label>
        <Input
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
      </div>

      {isNewNumber && (
        <div className="space-y-1.5">
          <Label>Save to contacts (optional)</Label>
          <Input
            value={form.saveName}
            onChange={(e) => setForm({ ...form, saveName: e.target.value })}
            placeholder="Name for this number"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {contacts.data?.filter((c) => isSavedContact(c)).slice(0, 8).map((c) => (
          <button
            key={c.id}
            type="button"
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              form.to === c.phone ? 'border-primary bg-accent text-accent-foreground' : 'hover:bg-muted'
            )}
            onClick={() => {
              setPendingSave(null);
              setForm({ ...form, to: c.phone, saveName: '' });
            }}
          >
            {c.name}
          </button>
        ))}
      </div>

      <Button type="button" variant="ghost" onClick={() => setShowKeypad((v) => !v)}>
        {showKeypad ? 'Hide keypad' : 'Use number keypad'}
      </Button>
      {showKeypad && (
        <div className="space-y-2">
          <Dialpad value={form.to} onChange={(to) => setForm({ ...form, to })} />
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setForm({ ...form, to: form.to.slice(0, -1) })}>Delete</Button>
            <Button type="button" variant="ghost" onClick={() => setForm({ ...form, to: '' })}>Clear</Button>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Message</Label>
        <Textarea
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          placeholder="Write your text here..."
          rows={4}
          required
        />
      </div>

      {selected?.is_unsubscribed && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          This contact unsubscribed. You can’t text them.
        </div>
      )}

      {status && (
        <div className={cn(
          'rounded-md border px-3 py-2 text-sm',
          status.startsWith('Sent')
            ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
            : 'border-destructive/30 bg-destructive/10 text-destructive'
        )}>
          {status}
        </div>
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

      <div className="flex justify-end gap-2">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button disabled={!canSend || sending}>
          {sending ? 'Sending…' : 'Send message'}
        </Button>
      </div>
    </form>
  );
}
