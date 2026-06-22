import { useState } from 'react';
import { useAuth } from './auth/AuthContext';
import Sidebar from './components/Sidebar';
import Contacts from './pages/Contacts';
import Numbers from './pages/Numbers';
import Settings from './pages/Settings';
import Inbox from './pages/Inbox';
import ManualSms from './pages/ManualSms';
import AdminConsole from './pages/AdminConsole';
import Login from './pages/Login';
import Logo from './components/Logo';

const pages = {
  messages: Inbox,
  contacts: Contacts,
  newText: ManualSms,
  numbers: Numbers,
  settings: Settings,
  admin: AdminConsole,
};

export default function App() {
  const { user, loading } = useAuth();
  const [page, setPage] = useState('messages');

  if (loading) return <div className="auth-loading"><Logo />Loading workspace...</div>;
  if (!user) return <Login />;

  const isAdmin = user.role === 'admin';
  const Page = page === 'admin' && !isAdmin ? Inbox : (pages[page] || Inbox);

  return (
    <div className="app-shell">
      <Sidebar page={page} setPage={setPage} user={user} logout={useAuth().logout} />
      <main className="workspace">
        <Page />
      </main>
    </div>
  );
}
