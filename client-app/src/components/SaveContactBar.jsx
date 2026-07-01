import { useState } from 'react';
import { api } from '../api/client';
import Button from './Button';
import { isSavedContact } from '../lib/contactUtils';

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
    <div className="save-contact-bar">
      <div className="save-contact-copy">
        <strong>Save to contacts</strong>
        <span>{phone}</span>
      </div>
      <div className="save-contact-form">
        <input
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
      {error && <p className="save-contact-error">{error}</p>}
    </div>
  );
}
