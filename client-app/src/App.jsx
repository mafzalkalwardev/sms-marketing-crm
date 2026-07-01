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
import Login from './pages/Login';
import Logo from './components/Logo';

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

export default function App() {
  const { user, loading, logout } = useAuth();
  const branding = useBranding();
  const [page, setPage] = useState('messages');

  if (loading) return <div className="auth-loading"><Logo brandName={branding.data?.brandName} />Loading workspace...</div>;
  if (!user) return <Login />;

  const isSuperAdmin = user.role === 'super_admin';
  const isAdmin = user.role === 'admin' || isSuperAdmin;

  let Page = pages[page] || Inbox;
  if (page === 'super' && !isSuperAdmin) Page = Inbox;
  if (page === 'admin' && !isAdmin) Page = Inbox;

  return (
    <div className="app-shell">
      <Sidebar page={page} setPage={setPage} user={user} logout={logout} />
      <main className="workspace">
        <Page setPage={setPage} />
      </main>
      <MobileNav page={page} setPage={setPage} />
    </div>
  );
}
