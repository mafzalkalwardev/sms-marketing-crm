import { useEffect, useState } from 'react';
import { api } from '../api/client';
import useAsync from '../hooks/useAsync';
import Topbar from '../components/Topbar';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import MessageBubble from '../components/MessageBubble';
import Modal from '../components/Modal';
import DialerWorkspace from '../components/DialerWorkspace';
import { formatStatus } from '../lib/formatStatus';

export default function Inbox() {
  const conversations = useAsync(() => api('/api/conversations'), []);
  const numbers = useAsync(() => api('/api/numbers'), []);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [search, setSearch] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const active = conversations.data?.find((conversation) => conversation.id === selected) || conversations.data?.[0];
  const filtered = conversations.data?.filter((conversation) =>
    `${conversation.name} ${conversation.phone}`.toLowerCase().includes(search.toLowerCase())
  ) || [];
  const defaultLine = numbers.data?.find((n) => n.is_default)?.phone_number || numbers.data?.[0]?.phone_number;

  useEffect(() => {
    if (!active) return;
    setSelected(active.id);
    api(`/api/conversations/${active.id}/messages`).then(setMessages).catch(() => setMessages([]));
  }, [active?.id]);

  const send = async () => {
    if (!active || !reply.trim()) return;
    setSending(true);
    setError('');
    try {
      const result = await api(`/api/conversations/${active.id}/messages`, { method: 'POST', body: { message: reply } });
      setReply('');
      setMessages((current) => [...current, result.message]);
      conversations.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
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
      <Topbar
        title="Messages"
        subtitle={defaultLine ? `Business line ${defaultLine}` : 'Business texting inbox'}
        action={<Button onClick={() => setComposeOpen(true)}>New message</Button>}
      />
      {error && <div className="alert error">{error}</div>}
      <section className="messenger-layout">
        <aside className="panel conversation-dock">
          <div className="dock-header"><strong>Inbox</strong><span>{filtered.length} threads</span></div>
          <input placeholder="Search conversations" value={search} onChange={(e) => setSearch(e.target.value)} />
          {!filtered.length && <EmptyState title="No conversations yet" text="Start a new message from the dialpad." />}
          {filtered.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              className={active?.id === conversation.id ? 'active' : ''}
              onClick={() => setSelected(conversation.id)}
            >
              <div className="avatar small">{(conversation.name || conversation.phone || '?').charAt(0).toUpperCase()}</div>
              <div>
                <strong>{conversation.name || conversation.phone}</strong>
                <span>{conversation.phone}</span>
                <small>{conversation.lastMessage?.message_body || 'No messages yet'}</small>
              </div>
              {conversation.unread_count > 0 && <em>{conversation.unread_count}</em>}
            </button>
          ))}
        </aside>

        <section className="panel chat-window">
          {active ? (
            <>
              <div className="chat-header">
                <div className="avatar">{(active.name || active.phone).charAt(0).toUpperCase()}</div>
                <div>
                  <h3>{active.name || active.phone}</h3>
                  <span>{active.phone}</span>
                </div>
                <span className={`badge ${active.is_unsubscribed ? 'danger' : 'active'}`}>
                  {active.is_unsubscribed ? 'Unsubscribed' : formatStatus(active.status)}
                </span>
              </div>
              <div className="thread">
                {messages.length
                  ? messages.map((message) => <MessageBubble key={message.id} message={message} />)
                  : <EmptyState title="No messages yet" text="Send a reply to start this thread." />}
              </div>
              <div className="reply-bar">
                <textarea
                  value={reply}
                  onKeyDown={keySend}
                  onChange={(e) => setReply(e.target.value)}
                  disabled={Boolean(active.is_unsubscribed)}
                  placeholder={active.is_unsubscribed ? 'Contact is unsubscribed' : 'Write a message...'}
                />
                <Button disabled={Boolean(active.is_unsubscribed) || sending} onClick={send}>
                  {sending ? 'Sending...' : 'Send'}
                </Button>
              </div>
            </>
          ) : (
            <EmptyState title="Select a conversation" text="Your message threads appear in the left panel." />
          )}
        </section>

        <aside className="panel contact-sidebar">
          <h3>Contact</h3>
          {active ? (
            <>
              <div className="profile-card">
                <div className="avatar large">{(active.name || active.phone).charAt(0).toUpperCase()}</div>
                <strong>{active.name || active.phone}</strong>
                <span>{active.phone}</span>
              </div>
              <div className="notes-box">
                <strong>Consent</strong>
                <p>{active.is_unsubscribed ? 'Unsubscribed. Sending is blocked.' : active.consent_status || 'Opted in'}</p>
              </div>
              <Button variant="ghost" onClick={() => navigator.clipboard?.writeText(active.phone)}>Copy number</Button>
            </>
          ) : (
            <EmptyState title="No contact selected" text="Contact details appear here." />
          )}
        </aside>
      </section>

      {composeOpen && (
        <Modal title="New message" onClose={() => setComposeOpen(false)} wide>
          <DialerWorkspace
            compact
            onSent={() => {
              setComposeOpen(false);
              conversations.refresh();
            }}
          />
        </Modal>
      )}
    </>
  );
}
