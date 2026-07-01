import Logo from './Logo';
import ThemeToggle from './ThemeToggle';
import useBranding from '../hooks/useBranding';

const mainNav = [
  { id: 'messages', label: 'Inbox', icon: '◉' },
  { id: 'newText', label: 'New text', icon: '✎', highlight: true },
  { id: 'contacts', label: 'Contacts', icon: '◎' },
];

const insightsNav = [
  { id: 'dashboard', label: 'Dashboard', icon: '▤' },
  { id: 'campaigns', label: 'Campaigns', icon: '▶' },
  { id: 'reports', label: 'Reports', icon: '▥' },
];

const manageNav = [
  { id: 'numbers', label: 'My numbers', icon: '☎' },
  { id: 'compliance', label: 'Compliance', icon: '⚖' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

export default function Sidebar({ page, setPage, user, logout }) {
  const branding = useBranding();
  const adminNav = [];
  if (user.role === 'admin' || user.role === 'super_admin') {
    adminNav.push({ id: 'admin', label: 'Team admin', icon: '▣' });
  }
  if (user.role === 'super_admin') {
    adminNav.push({ id: 'super', label: 'Platform', icon: '★' });
  }

  const renderItem = (item) => (
    <button
      key={item.id}
      type="button"
      className={`nav-item ${page === item.id ? 'active' : ''} ${item.highlight ? 'highlight' : ''}`}
      onClick={() => setPage(item.id)}
    >
      <span className="nav-icon" aria-hidden>{item.icon}</span>
      <span>{item.label}</span>
    </button>
  );

  return (
    <aside className="sidebar">
      <div className="brand">
        <Logo brandName={branding.data?.brandName || user.branding?.brandName || 'SignalMint'} />
        <ThemeToggle compact />
      </div>

      <nav className="sidebar-nav">
        <p className="nav-section">Menu</p>
        {mainNav.map(renderItem)}

        <p className="nav-section">Insights</p>
        {insightsNav.map(renderItem)}

        <p className="nav-section">Manage</p>
        {manageNav.map(renderItem)}

        {adminNav.length > 0 && (
          <>
            <p className="nav-section">Admin</p>
            {adminNav.map(renderItem)}
          </>
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="user-chip">
          <div className="avatar small">{(user.name || user.email || '?').charAt(0).toUpperCase()}</div>
          <div>
            <strong>{user.name || 'User'}</strong>
            <small>{user.email}</small>
          </div>
        </div>
        <button type="button" className="btn ghost full" onClick={logout}>Sign out</button>
      </div>
    </aside>
  );
}
