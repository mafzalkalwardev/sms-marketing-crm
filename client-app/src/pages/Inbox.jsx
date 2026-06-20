import { useEffect, useState } from 'react';
import { api } from '../api/client';
import useAsync from '../hooks/useAsync';
import Topbar from '../components/Topbar';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import MessageBubble from '../components/MessageBubble';
import Modal from '../components/Modal';
import Dialpad from '../components/Dialpad';

export default function Inbox() {
  const conversations = useAsync(() => api('/api/conversations'), []);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [search, setSearch] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [compose, setCompose] = useState({ phone: '', message: '' });
  const [error, setError] = useState('');
  const active = conversations.data?.find((conversation) => conversation.id === selected) || conversations.data?.[0];
  const filtered = conversations.data?.filter((conversation) => `${conversation.name} ${conversation.phone}`.toLowerCase().includes(search.toLowerCase())) || [];

  useEffect(() => {
    if (!active) return;
    setSelected(active.id);
    api(`/api/conversations/${active.id}/messages`).then(setMessages).catch(() => setMessages([]));
  }, [active?.id]);

  const send = async () => {
    if (!active || !reply.trim()) return;
    try {
      const result = await api(`/api/conversations/${active.id}/messages`, { method: 'POST', body: { message: reply } });
      setReply('');
      setMessages((current) => [...current, result.message]);
      conversations.refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const startConversation = async (event) => {
    event.preventDefault();
    setError('');
    try {
      const started = await api('/api/conversations/start', { method: 'POST', body: { phone: compose.phone } });
      if (compose.message.trim()) {
        await api(`/api/conversations/${started.conversationId}/messages`, { method: 'POST', body: { message: compose.message } });
      }
      setCompose({ phone: '', message: '' });
      setComposeOpen(false);
      setSelected(started.conversationId);
      conversations.refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const keySend = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  return (
    <>
      <Topbar title="Messages" subtitle="Business texting workspace" action={<Button onClick={() => setComposeOpen(true)}>New message</Button>} />
      {error && <div className="alert error">{error}</div>}
      <section className="messenger-layout">
        <aside className="panel conversation-dock">
          <div className="dock-header"><strong>Messages</strong><span>{filtered.length} threads</span></div>
          <input placeholder="Search conversations" value={search} onChange={(e) => setSearch(e.target.value)} />
          {!filtered.length && <EmptyState title="No conversations yet" text="Run npm run seed in server or start a new message." />}
          {filtered.map((conversation) => (
            <button key={conversation.id} className={active?.id === conversation.id ? 'active' : ''} onClick={() => setSelected(conversation.id)}>
              <div className="avatar small">{(conversation.name || conversation.phone || '?').charAt(0).toUpperCase()}</div>
              <div><strong>{conversation.name || conversation.phone}</strong><span>{conversation.phone}</span><small>{conversation.lastMessage?.message_body || 'No message preview'}</small></div>
              {conversation.unread_count > 0 && <em>{conversation.unread_count}</em>}
            </button>
          ))}
        </aside>
        <section className="panel chat-window">
          {active ? (
            <>
              <div className="chat-header"><div className="avatar">{(active.name || active.phone).charAt(0).toUpperCase()}</div><div><h3>{active.name || active.phone}</h3><span>From mock business line · {active.phone}</span></div><span className={`badge ${active.is_unsubscribed ? 'danger' : 'active'}`}>{active.is_unsubscribed ? 'unsubscribed' : active.status}</span></div>
              <div className="thread">{messages.length ? messages.map((message) => <MessageBubble key={message.id} message={message} />) : <EmptyState title="No messages loaded" text="This conversation is ready for replies." />}</div>
              <div className="reply-bar"><textarea value={reply} onKeyDown={keySend} onChange={(e) => setReply(e.target.value)} disabled={Boolean(active.is_unsubscribed)} placeholder={active.is_unsubscribed ? 'This contact is unsubscribed' : 'Message...'} /><Button disabled={Boolean(active.is_unsubscribed)} onClick={send}>Send</Button></div>
            </>
          ) : <EmptyState title="Select a conversation" text="Threads will appear here after SMS activity." />}
        </section>
        <aside className="panel contact-sidebar">
          <h3>Contact</h3>
          {active ? <><div className="profile-card"><div className="avatar large">{(active.name || active.phone).charAt(0).toUpperCase()}</div><strong>{active.name || active.phone}</strong><span>{active.phone}</span></div><div className="notes-box"><strong>Consent</strong><p>{active.is_unsubscribed ? 'Unsubscribed. Sending is blocked.' : active.consent_status || 'Unknown'}</p></div><div className="notes-box"><strong>Notes / tags</strong><p>{active.tags || 'No tags yet. Use contact records to track source, priority, or owner.'}</p></div><Button variant="ghost" onClick={() => navigator.clipboard?.writeText(active.phone)}>Copy number</Button></> : <EmptyState title="No contact selected" text="Contact details appear here." />}
        </aside>
      </section>
      {composeOpen && (
        <Modal title="New message" onClose={() => setComposeOpen(false)}>
          <form className="stack" onSubmit={startConversation}>
            <label className="field"><span>To</span><input value={compose.phone} onChange={(event) => setCompose({ ...compose, phone: event.target.value })} placeholder="+15551234567" required /></label>
            <Dialpad value={compose.phone} onChange={(phone) => setCompose({ ...compose, phone })} />
            <label className="field"><span>Message</span><textarea value={compose.message} onChange={(event) => setCompose({ ...compose, message: event.target.value })} placeholder="Start the conversation..." /></label>
            <Button>Start conversation</Button>
          </form>
        </Modal>
      )}
    </>
  );
}
