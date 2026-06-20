const items = [
  ['dashboard', 'Dashboard'],
  ['manual', 'Manual SMS'],
  ['inbox', 'Inbox'],
  ['contacts', 'Contacts'],
  ['campaigns', 'Campaigns'],
  ['numbers', 'Numbers'],
  ['reports', 'Reports'],
  ['settings', 'Settings'],
  ['compliance', 'Compliance'],
];

export default function Sidebar({ page, setPage, user, logout }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">SM</div>
        <div>
          <strong>SignalMint</strong>
          <span>SMS CRM</span>
        </div>
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
