import { MessageSquare, PenLine, Users, LayoutDashboard, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { id: 'messages', label: 'Inbox', icon: MessageSquare },
  { id: 'newText', label: 'Text', icon: PenLine },
  { id: 'contacts', label: 'Contacts', icon: Users },
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { id: 'settings', label: 'More', icon: MoreHorizontal },
];

export default function MobileNav({ page, setPage }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-card/95 backdrop-blur md:hidden">
      {items.map((item) => {
        const Icon = item.icon;
        const active = page === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setPage(item.id)}
            className={cn(
              'flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium',
              active ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <Icon className="h-5 w-5" />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
