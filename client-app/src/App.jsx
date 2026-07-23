import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from './auth/AuthContext';
import useBranding from './hooks/useBranding';
import Sidebar from './components/Sidebar';
import MobileNav from './components/MobileNav';
import Contacts from './pages/Contacts';
import Numbers from './pages/Numbers';
import Settings from './pages/Settings';
import Inbox from './pages/Inbox';
import ManualSms from './pages/ManualSms';
import Dashboard from './pages/Dashboard';
import Campaigns from './pages/Campaigns';
import Reports from './pages/Reports';
import Compliance from './pages/Compliance';
import AdminConsole from './pages/AdminConsole';
import SuperAdminConsole from './pages/SuperAdminConsole';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Logo from './components/Logo';
import PageTransition from './components/PageTransition';
import { Button } from '@/components/ui/button';

const pages = {
  messages: Inbox,
  dashboard: Dashboard,
  contacts: Contacts,
  newText: ManualSms,
  campaigns: Campaigns,
  reports: Reports,
  compliance: Compliance,
  numbers: Numbers,
  settings: Settings,
  admin: AdminConsole,
  super: SuperAdminConsole,
};

function wantsAuthScreen() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('login') === '1' || params.get('signup') === '1') return true;
  const hash = window.location.hash.replace('#', '');
  return hash === 'login' || hash === 'signup';
}

export default function App() {
  const { user, loading, logout, endImpersonation } = useAuth();
  const branding = useBranding();
  const [page, setPage] = useState('messages');
  const [showAuth, setShowAuth] = useState(() => wantsAuthScreen());

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
        <Logo brandName={branding.data?.brandName} />
        Loading workspace...
      </div>
    );
  }

  if (!user) {
    if (showAuth) return <Login onBack={() => setShowAuth(false)} />;
    return <Landing onSignIn={() => setShowAuth(true)} />;
  }

  const isSuperAdmin = user.role === 'super_admin';
  const isAdmin = user.role === 'admin' || isSuperAdmin;
  let Page = pages[page] || Inbox;
  if (page === 'super' && !isSuperAdmin) Page = Inbox;
  if (page === 'admin' && !isAdmin) Page = Inbox;

  return (
    <div className="flex min-h-screen bg-background">
      {user.impersonated_by && (
        <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/80 dark:text-amber-100">
          <span>
            Viewing as <strong>{user.name}</strong> ({user.email})
          </span>
          <Button variant="ghost" size="sm" onClick={() => endImpersonation().catch(() => logout())}>
            Exit impersonation
          </Button>
        </div>
      )}
      <Sidebar page={page} setPage={setPage} user={user} logout={logout} />
      <main className={`min-w-0 flex-1 overflow-auto p-4 md:p-6 ${user.impersonated_by ? 'pt-14' : ''}`}>
        <AnimatePresence mode="wait">
          <PageTransition id={page}>
            <Page setPage={setPage} />
          </PageTransition>
        </AnimatePresence>
      </main>
      <MobileNav page={page} setPage={setPage} />
    </div>
  );
}
