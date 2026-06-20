import Logo from './Logo';

const items = [
  ['messages', 'Messages'],
  ['contacts', 'Contacts'],
  ['newText', 'Dialpad / New Text'],
  ['numbers', 'Numbers'],
  ['settings', 'Settings'],
];

export default function Sidebar({ page, setPage, user, logout }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <Logo />
      </div>
      <div className="line-identity">
        <span>Workspace line</span>
        <strong>Mock business number</strong>
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
