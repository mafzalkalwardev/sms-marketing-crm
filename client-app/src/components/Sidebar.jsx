import Logo from './Logo';

const baseItems = [
  ['messages', 'Messages'],
  ['contacts', 'Contacts'],
  ['newText', 'Dialpad / New Text'],
  ['numbers', 'Numbers'],
  ['settings', 'Settings'],
];

export default function Sidebar({ page, setPage, user, logout }) {
  const items = [...baseItems];
  if (user.role === 'admin') items.push(['admin', 'Admin Console']);
  if (user.role === 'super_admin') {
    items.push(['admin', 'Admin Console']);
    items.push(['super', 'Super Admin']);
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <Logo />
      </div>
      <div className="line-identity">
        <span>Business line</span>
        <strong>SignalMint</strong>
      </div>
      <nav>
        {items.map(([id, label]) => (
          <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}>
            {label}
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <span>{user.name}</span>
        <small>{user.email}</small>
        <button className="btn ghost full" onClick={logout}>Logout</button>
      </div>
    </aside>
  );
}
