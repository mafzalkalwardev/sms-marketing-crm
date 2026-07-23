import { Label } from '@/components/ui/label';

export default function LinePicker({ lines = [], value, onChange, compact = false }) {
  if (!lines.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No sender number yet. Add one under <strong>My numbers</strong>.
      </p>
    );
  }

  if (lines.length === 1) {
    const line = lines[0];
    return (
      <div className={compact ? 'text-xs text-muted-foreground' : 'rounded-lg border bg-muted/40 px-3 py-2 text-sm'}>
        <span className="text-muted-foreground">Sending from </span>
        <strong>{line.label}</strong>
        <span className="ml-2 text-muted-foreground">{line.phone}</span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label>Send from</Label>
      <select
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
      >
        <option value="">Choose line</option>
        {lines.map((line) => (
          <option key={line.id} value={line.phone}>
            {line.label} — {line.phone}
          </option>
        ))}
      </select>
    </div>
  );
}
