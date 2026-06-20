import { useState } from 'react';
import { useAuth } from './auth/AuthContext';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Contacts from './pages/Contacts';
import ManualSms from './pages/ManualSms';
import Inbox from './pages/Inbox';
import Campaigns from './pages/Campaigns';
import Numbers from './pages/Numbers';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Compliance from './pages/Compliance';
import Login from './pages/Login';

const pages = {
  dashboard: Dashboard,
  contacts: Contacts,
  manual: ManualSms,
  inbox: Inbox,
  campaigns: Campaigns,
  numbers: Numbers,
  reports: Reports,
  settings: Settings,
  compliance: Compliance,
};

export default function App() {
  const { user, logout } = useAuth();
  const [page, setPage] = useState('dashboard');
  if (!user) return <Login />;

  const Page = pages[page] || Dashboard;
  return (
    <div className="app-shell">
      <Sidebar page={page} setPage={setPage} user={user} logout={logout} />
      <main className="workspace">
        <Page />
      </main>
    </div>
  );
}
