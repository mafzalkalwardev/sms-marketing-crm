import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

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
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

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
    const load = () => api(`/api/conversations/${active.id}/messages`).then(setMessages).catch(() => setMessages([]));
    load();
    const interval = setInterval(() => {
      conversations.refresh();
      load();
    }, 12000);
    return () => clearInterval(interval);
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
      workspace.refresh();
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
    <div className="space-y-4 pb-20 md:pb-4">
      <Topbar
        title="Inbox"
        subtitle={
          workspace.data?.usage?.messageLimitMonthly
            ? `${workspace.data.usage.messagesUsedThisMonth} / ${workspace.data.usage.messageLimitMonthly} messages this month`
            : workspace.data?.defaultLine
              ? `Line ${workspace.data.defaultLine}`
              : 'Your business texting inbox'
        }
        action={<Button onClick={() => setComposeOpen(true)}>+ New text</Button>}
      />

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
      {workspace.data?.usage?.messageLimitMonthly
        && workspace.data.usage.messagesRemaining !== null
        && workspace.data.usage.messagesRemaining <= 50 && (
        <div className={cn(
          'rounded-md border px-3 py-2 text-sm',
          workspace.data.usage.messagesRemaining === 0
            ? 'border-destructive/30 bg-destructive/10 text-destructive'
            : 'border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100'
        )}>
          {workspace.data.usage.messagesRemaining === 0
            ? 'Monthly message limit reached. Contact your admin to increase your plan.'
            : `${workspace.data.usage.messagesRemaining} messages left this month.`}
        </div>
      )}

      <section className="grid h-[calc(100vh-12rem)] overflow-hidden rounded-xl border bg-card md:grid-cols-[320px_1fr]">
        <aside className={cn('flex flex-col border-r', mobileChatOpen && 'hidden md:flex')}>
          <div className="p-3">
            <Input
              placeholder="Search name or number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {!filtered.length && (
              <EmptyState title="No conversations" text="Tap New text to send your first message." />
            )}
            {filtered.map((conversation) => {
              const saved = isSavedContact(conversation);
              const title = displayName(conversation);
              return (
                <motion.button
                  key={conversation.id}
                  type="button"
                  whileTap={{ scale: 0.99 }}
                  className={cn(
                    'mb-1 flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors',
                    active?.id === conversation.id ? 'bg-accent' : 'hover:bg-muted'
                  )}
                  onClick={() => {
                    setSelected(conversation.id);
                    setMobileChatOpen(true);
                  }}
                >
                  <Avatar className="h-9 w-9">
                    <AvatarFallback>{title.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <strong className="truncate text-sm">{title}</strong>
                      {conversation.unread_count > 0 && (
                        <Badge className="h-5 min-w-5 justify-center px-1.5">{conversation.unread_count}</Badge>
                      )}
                    </div>
                    <small className="line-clamp-1 text-xs text-muted-foreground">
                      {!saved && <span className="text-amber-600">Unsaved · </span>}
                      {conversation.lastMessage?.message_body || 'No messages yet'}
                    </small>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </aside>

        <section className={cn('flex min-h-0 flex-col', !mobileChatOpen && 'hidden md:flex')}>
          {active ? (
            <>
              <div className="flex items-center gap-3 border-b p-3">
                <Button variant="ghost" className="md:hidden" onClick={() => setMobileChatOpen(false)}>←</Button>
                <Avatar>
                  <AvatarFallback>{displayName(active).charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold">{displayName(active)}</h3>
                  <span className="text-xs text-muted-foreground">{active.phone}</span>
                </div>
                {!activeSaved && setPage && (
                  <Button variant="ghost" size="sm" onClick={() => setPage('contacts')}>Contacts</Button>
                )}
                {active.is_unsubscribed && <Badge variant="destructive">Unsubscribed</Badge>}
              </div>

              {!activeSaved && (
                <SaveContactBar
                  phone={active.phone}
                  name={active.name}
                  conversationId={active.id}
                  onSaved={refreshAfterSave}
                />
              )}

              <div className="flex-1 space-y-2 overflow-y-auto bg-gradient-to-b from-muted/20 to-background p-4">
                {messages.length
                  ? messages.map((message) => <MessageBubble key={message.id} message={message} />)
                  : <EmptyState title="Start chatting" text="Type a message below to reply." />}
              </div>

              <div className="space-y-2 border-t p-3">
                {lines.length > 1 && (
                  <LinePicker compact lines={lines} value={replyFrom} onChange={setReplyFrom} />
                )}
                <div className="flex gap-2">
                  <Textarea
                    value={reply}
                    onKeyDown={onReplyKey}
                    onChange={(e) => setReply(e.target.value)}
                    disabled={Boolean(active.is_unsubscribed)}
                    placeholder={active.is_unsubscribed ? 'Contact unsubscribed' : 'Type your reply…'}
                    rows={2}
                    className="min-h-[64px]"
                  />
                  <Button disabled={Boolean(active.is_unsubscribed) || sending || !reply.trim()} onClick={send}>
                    {sending ? '…' : 'Send'}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
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
    </div>
  );
}
