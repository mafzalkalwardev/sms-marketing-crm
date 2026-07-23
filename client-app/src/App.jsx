import { useState } from 'react';
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
import Button from './components/Button';

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

  if (loading) return <div className="auth-loading"><Logo brandName={branding.data?.brandName} />Loading workspace...</div>;
  if (!user) {
    if (showAuth) {
      return <Login onBack={() => setShowAuth(false)} />;
    }
    return <Landing onSignIn={() => setShowAuth(true)} />;
  }

  const isSuperAdmin = user.role === 'super_admin';
  const isAdmin = user.role === 'admin' || isSuperAdmin;

  let Page = pages[page] || Inbox;
  if (page === 'super' && !isSuperAdmin) Page = Inbox;
  if (page === 'admin' && !isAdmin) Page = Inbox;

  return (
    <div className="app-shell">
      {user.impersonated_by && (
        <div className="alert warn impersonation-banner">
          <span>Viewing as <strong>{user.name}</strong> ({user.email})</span>
          <Button variant="ghost" onClick={() => endImpersonation().catch(() => logout())}>Exit impersonation</Button>
        </div>
      )}
      <Sidebar page={page} setPage={setPage} user={user} logout={logout} />
      <main className="workspace">
        <Page setPage={setPage} />
      </main>
      <MobileNav page={page} setPage={setPage} />
    </div>
  );
}
