import { useState } from 'react';
import { useAuth } from './auth/AuthContext';
import Sidebar from './components/Sidebar';
import Contacts from './pages/Contacts';
import ManualSms from './pages/ManualSms';
import Messages from './pages/Inbox';
import Numbers from './pages/Numbers';
import Settings from './pages/Settings';
import Login from './pages/Login';

const pages = {
  messages: Messages,
  contacts: Contacts,
  newText: ManualSms,
  numbers: Numbers,
  settings: Settings,
};

export default function App() {
  const { user, loading, logout } = useAuth();
  const [page, setPage] = useState('messages');
  if (loading) return <div className="auth-loading">Loading SignalMint...</div>;
  if (!user) return <Login />;

  const Page = pages[page] || Messages;
  return (
    <div className="app-shell">
      <Sidebar page={page} setPage={setPage} user={user} logout={logout} />
      <main className="workspace">
        <Page />
      </main>
    </div>
  );
}
