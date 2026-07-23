import { useState } from 'react';
import { api } from '../api/client';
import Button from './Button';
import { isSavedContact } from '../lib/contactUtils';
import { Input } from '@/components/ui/input';

export default function SaveContactBar({ phone, name = '', conversationId, onSaved }) {
  const [contactName, setContactName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  if (done || isSavedContact({ phone, name })) return null;

  const save = async () => {
    const trimmed = contactName.trim();
    if (!trimmed) {
      setError('Enter a name to save this number.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api('/api/contacts/save-from-conversation', {
        method: 'POST',
        body: {
          phone,
          name: trimmed,
          conversation_id: conversationId || undefined,
        },
      });
      setDone(true);
      onSaved?.({ phone, name: trimmed });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 border-b bg-amber-50 px-3 py-2 dark:bg-amber-950/30">
      <div className="min-w-0">
        <strong className="text-sm">Save to contacts</strong>
        <span className="ml-2 text-xs text-muted-foreground">{phone}</span>
      </div>
      <div className="flex flex-1 items-center gap-2">
        <Input
          type="text"
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          placeholder="Contact name"
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), save())}
        />
        <Button type="button" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </div>
  );
}
