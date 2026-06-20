import { useEffect, useState } from 'react';
import { api } from '../api/client';
import useAsync from '../hooks/useAsync';
import Topbar from '../components/Topbar';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import MessageBubble from '../components/MessageBubble';

export default function Inbox() {
  const conversations = useAsync(() => api('/api/inbox/conversations'), []);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [search, setSearch] = useState('');
  const active = conversations.data?.find((conversation) => conversation.id === selected) || conversations.data?.[0];
  const filtered = conversations.data?.filter((conversation) => `${conversation.name} ${conversation.phone}`.toLowerCase().includes(search.toLowerCase())) || [];

  useEffect(() => {
    if (!active) return;
    setSelected(active.id);
    api(`/api/inbox/conversations/${active.id}/messages`).then(setMessages).catch(() => setMessages([]));
  }, [active?.id]);

  const send = async () => {
    if (!active || !reply.trim()) return;
    await api(`/api/inbox/conversations/${active.id}/reply`, { method: 'POST', body: { message: reply } });
    setReply('');
    setMessages(await api(`/api/inbox/conversations/${active.id}/messages`));
    conversations.refresh();
  };

  return (
    <>
      <Topbar title="Inbox" subtitle="OpenPhone-style messaging" />
      <section className="messenger-layout">
        <aside className="panel conversation-dock">
          <input placeholder="Search conversations" value={search} onChange={(e) => setSearch(e.target.value)} />
          {!filtered.length && <EmptyState title="No conversations" text="Send or receive a message to create a thread." />}
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
              <div className="chat-header"><div className="avatar">{(active.name || active.phone).charAt(0).toUpperCase()}</div><div><h3>{active.name || active.phone}</h3><span>{active.phone}</span></div><span className="badge active">{active.status}</span></div>
              <div className="thread">{messages.length ? messages.map((message) => <MessageBubble key={message.id} message={message} />) : <EmptyState title="No messages loaded" text="This conversation is ready for replies." />}</div>
              <div className="reply-bar"><textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Message..." /><Button onClick={send}>Send</Button></div>
            </>
          ) : <EmptyState title="Select a conversation" text="Threads will appear here after SMS activity." />}
        </section>
        <aside className="panel contact-sidebar">
          <h3>Contact</h3>
          {active ? <><div className="profile-card"><div className="avatar large">{(active.name || active.phone).charAt(0).toUpperCase()}</div><strong>{active.name || active.phone}</strong><span>{active.phone}</span></div><div className="notes-box"><strong>Notes / tags</strong><p>{active.tags || 'No tags yet. Use contact records to track source, campaign, or priority.'}</p></div></> : <EmptyState title="No contact selected" text="Contact details appear here." />}
        </aside>
      </section>
    </>
  );
}
