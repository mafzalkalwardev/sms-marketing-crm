import { MessageSquare, PenLine, Users, LayoutDashboard, Play, BarChart3, Phone, Scale, Settings, Shield, Crown, LogOut } from 'lucide-react';
import { motion } from 'framer-motion';
import Logo from './Logo';
import ThemeToggle from './ThemeToggle';
import useBranding from '../hooks/useBranding';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

const mainNav = [
  { id: 'messages', label: 'Inbox', icon: MessageSquare },
  { id: 'newText', label: 'New text', icon: PenLine, highlight: true },
  { id: 'contacts', label: 'Contacts', icon: Users },
];

const insightsNav = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'campaigns', label: 'Campaigns', icon: Play },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
];

const manageNav = [
  { id: 'numbers', label: 'My numbers', icon: Phone },
  { id: 'compliance', label: 'Compliance', icon: Scale },
  { id: 'settings', label: 'Settings', icon: Settings },
];

function NavButton({ item, active, onClick }) {
  const Icon = item.icon;
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        item.highlight && !active && 'bg-gradient-to-r from-primary to-indigo-400 text-primary-foreground hover:opacity-95'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{item.label}</span>
    </motion.button>
  );
}

export default function Sidebar({ page, setPage, user, logout }) {
  const branding = useBranding();
  const adminNav = [];
  if (user.role === 'admin' || user.role === 'super_admin') {
    adminNav.push({ id: 'admin', label: 'Team admin', icon: Shield });
  }
  if (user.role === 'super_admin') {
    adminNav.push({ id: 'super', label: 'Platform', icon: Crown });
  }

  const section = (title, items) => (
    <div className="space-y-1">
      <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      {items.map((item) => (
        <NavButton key={item.id} item={item} active={page === item.id} onClick={() => setPage(item.id)} />
      ))}
    </div>
  );

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r bg-card md:flex">
      <div className="flex items-center justify-between gap-2 px-4 py-4">
        <Logo brandName={branding.data?.brandName || user.branding?.brandName || 'SignalMint'} />
        <ThemeToggle compact />
      </div>
      <Separator />
      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto p-3">
        {section('Menu', mainNav)}
        {section('Insights', insightsNav)}
        {section('Manage', manageNav)}
        {adminNav.length > 0 && section('Admin', adminNav)}
      </nav>
      <div className="border-t p-3">
        <p className="truncate px-2 text-sm font-medium">{user.name}</p>
        <p className="truncate px-2 text-xs text-muted-foreground">{user.email}</p>
        <Button variant="ghost" className="mt-2 w-full justify-start gap-2" onClick={logout}>
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </div>
    </aside>
  );
}
