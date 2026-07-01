export default function LinePicker({ lines = [], value, onChange, compact = false }) {
  if (!lines.length) {
    return <p className="line-picker-empty">No sender number yet. Add one under <strong>My numbers</strong>.</p>;
  }

  if (lines.length === 1) {
    const line = lines[0];
    return (
      <div className={`line-picker-single ${compact ? 'compact' : ''}`}>
        <span className="line-picker-label">Sending from</span>
        <strong>{line.label}</strong>
        <small>{line.phone}</small>
      </div>
    );
  }

  return (
    <label className={`field ${compact ? 'compact' : ''}`}>
      <span>Send from</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} required>
        <option value="">Choose line</option>
        {lines.map((line) => (
          <option key={line.id} value={line.phone}>
            {line.label} — {line.phone}
          </option>
        ))}
      </select>
    </label>
  );
}
