export default function MobileNav({ page, setPage }) {
  const items = [
    { id: 'messages', label: 'Inbox', icon: '◉' },
    { id: 'newText', label: 'New', icon: '✎' },
    { id: 'contacts', label: 'People', icon: '◎' },
    { id: 'dashboard', label: 'Stats', icon: '▤' },
    { id: 'compliance', label: 'Rules', icon: '⚖' },
    { id: 'settings', label: 'More', icon: '⚙' },
  ];

  return (
    <nav className="mobile-nav" aria-label="Main navigation">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={page === item.id ? 'active' : ''}
          onClick={() => setPage(item.id)}
        >
          <span aria-hidden>{item.icon}</span>
          <small>{item.label}</small>
        </button>
      ))}
    </nav>
  );
}
