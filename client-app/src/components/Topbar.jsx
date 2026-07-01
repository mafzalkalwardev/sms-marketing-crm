export default function Topbar({ title, subtitle, action }) {
  return (
    <header className="topbar">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="topbar-sub">{subtitle}</p>}
      </div>
      {action && <div className="topbar-action">{action}</div>}
    </header>
  );
}
