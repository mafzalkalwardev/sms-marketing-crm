import Logo from './Logo';

const baseItems = [
  ['messages', 'Messages'],
  ['newText', 'Dialpad'],
  ['contacts', 'Contacts'],
  ['numbers', 'Numbers'],
  ['settings', 'Settings'],
];

export default function Sidebar({ page, setPage, user, logout }) {
  const items = [...baseItems];
  if (user.role === 'admin' || user.role === 'super_admin') {
    items.push(['admin', 'Admin']);
  }
  if (user.role === 'super_admin') {
    items.push(['super', 'Super Admin']);
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <Logo />
      </div>
      <div className="line-identity">
        <span>Workspace</span>
        <strong>SignalMint</strong>
      </div>
      <nav>
        {items.map(([id, label]) => (
          <button key={`${id}-${label}`} type="button" className={page === id ? 'active' : ''} onClick={() => setPage(id)}>
            {label}
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <span>{user.name}</span>
        <small>{user.email}</small>
        <button type="button" className="btn ghost full" onClick={logout}>Logout</button>
      </div>
    </aside>
  );
}
