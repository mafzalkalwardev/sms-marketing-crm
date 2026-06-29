import { useEffect, useState } from 'react';
import { api } from '../api/client';
import useAsync from '../hooks/useAsync';
import Topbar from '../components/Topbar';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import MessageBubble from '../components/MessageBubble';
import Modal from '../components/Modal';
import ComposeForm from '../components/ComposeForm';
import SaveContactBar from '../components/SaveContactBar';
import { displayName, isSavedContact } from '../lib/contactUtils';
import useWorkspace from '../hooks/useWorkspace';
import LinePicker from '../components/LinePicker';

export default function Inbox({ setPage }) {
  const workspace = useWorkspace();
  const conversations = useAsync(() => api('/api/conversations'), []);
  const [replyFrom, setReplyFrom] = useState('');
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [search, setSearch] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const active = conversations.data?.find((c) => c.id === selected) || conversations.data?.[0];
  const filtered = conversations.data?.filter((c) =>
    `${c.name} ${c.phone}`.toLowerCase().includes(search.toLowerCase())
  ) || [];
  const activeSaved = active ? isSavedContact(active) : true;
  const lines = workspace.data?.lines || [];

  useEffect(() => {
    if (workspace.data?.defaultLine && !replyFrom) {
      setReplyFrom(workspace.data.defaultLine);
    }
  }, [workspace.data, replyFrom]);

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
      const result = await api(`/api/conversations/${active.id}/messages`, {
        method: 'POST',
        body: { message: reply, from: replyFrom || workspace.data?.defaultLine },
      });
      setReply('');
      setMessages((current) => [...current, result.message]);
      conversations.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const onReplyKey = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  const refreshAfterSave = () => conversations.refresh();

  return (
    <>
      <Topbar
        title="Inbox"
        subtitle={workspace.data?.defaultLine ? `Line ${workspace.data.defaultLine}` : 'Your business texting inbox'}
        action={<Button onClick={() => setComposeOpen(true)}>+ New text</Button>}
      />

      {error && <div className="alert error">{error}</div>}

      <section className="inbox-layout">
        <aside className="panel inbox-list">
          <input
            className="search-input"
            placeholder="Search name or number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="inbox-list-scroll">
            {!filtered.length && (
              <EmptyState title="No conversations" text="Tap New text to send your first message." />
            )}
            {filtered.map((conversation) => {
              const saved = isSavedContact(conversation);
              const title = displayName(conversation);
              return (
                <button
                  key={conversation.id}
                  type="button"
                  className={`inbox-item ${active?.id === conversation.id ? 'active' : ''}`}
                  onClick={() => setSelected(conversation.id)}
                >
                  <div className="avatar small">{title.charAt(0).toUpperCase()}</div>
                  <div className="inbox-item-body">
                    <div className="inbox-item-top">
                      <strong>{title}</strong>
                      {conversation.unread_count > 0 && <em>{conversation.unread_count}</em>}
                    </div>
                    <small>
                      {!saved && <span className="unsaved-tag">Unsaved · </span>}
                      {conversation.lastMessage?.message_body || 'No messages yet'}
                    </small>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="panel chat-panel">
          {active ? (
            <>
              <div className="chat-header">
                <div className="avatar">{displayName(active).charAt(0).toUpperCase()}</div>
                <div className="chat-header-text">
                  <h3>{displayName(active)}</h3>
                  <span>{active.phone}</span>
                </div>
                <div className="chat-header-actions">
                  {!activeSaved && setPage && (
                    <button type="button" className="text-btn" onClick={() => setPage('contacts')}>
                      Contacts
                    </button>
                  )}
                  {active.is_unsubscribed && <span className="badge danger">Unsubscribed</span>}
                </div>
              </div>

              {!activeSaved && (
                <SaveContactBar
                  phone={active.phone}
                  name={active.name}
                  conversationId={active.id}
                  onSaved={refreshAfterSave}
                />
              )}

              <div className="thread">
                {messages.length
                  ? messages.map((message) => <MessageBubble key={message.id} message={message} />)
                  : <EmptyState title="Start chatting" text="Type a message below to reply." />}
              </div>

              <div className="reply-compose">
                {lines.length > 1 && (
                  <LinePicker
                    compact
                    lines={lines}
                    value={replyFrom}
                    onChange={setReplyFrom}
                  />
                )}
                <div className="reply-row">
                <textarea
                  value={reply}
                  onKeyDown={onReplyKey}
                  onChange={(e) => setReply(e.target.value)}
                  disabled={Boolean(active.is_unsubscribed)}
                  placeholder={active.is_unsubscribed ? 'Contact unsubscribed' : 'Type your reply…'}
                  rows={2}
                />
                <Button disabled={Boolean(active.is_unsubscribed) || sending || !reply.trim()} onClick={send}>
                  {sending ? '…' : 'Send'}
                </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="chat-empty">
              <EmptyState title="Select a conversation" text="Choose someone from the list, or start a new text." />
              <Button onClick={() => setComposeOpen(true)}>+ New text</Button>
            </div>
          )}
        </section>
      </section>

      {composeOpen && (
        <Modal title="New text" onClose={() => setComposeOpen(false)}>
          <ComposeForm
            onCancel={() => setComposeOpen(false)}
            onSent={() => {
              conversations.refresh();
            }}
            onContactSaved={() => conversations.refresh()}
          />
        </Modal>
      )}
    </>
  );
}
