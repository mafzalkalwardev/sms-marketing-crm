import { Inbox } from 'lucide-react';

export default function EmptyState({ title = 'Nothing here yet', description, text, action }) {
  const body = description || text;
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/30 px-6 py-12 text-center">
      <Inbox className="h-10 w-10 text-muted-foreground" />
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      {body && <p className="max-w-sm text-sm text-muted-foreground">{body}</p>}
      {action}
    </div>
  );
}
