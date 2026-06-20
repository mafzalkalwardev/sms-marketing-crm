export default function Topbar({ title, subtitle, action }) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">{subtitle}</p>
        <h1>{title}</h1>
      </div>
      {action}
    </header>
  );
}
