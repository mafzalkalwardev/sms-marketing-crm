import { useTheme } from '../theme/ThemeContext';

const OPTIONS = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
];

export default function ThemeToggle({ compact = false }) {
  const { theme, setTheme, resolved } = useTheme();

  if (compact) {
    return (
      <button
        type="button"
        className="theme-toggle-compact"
        onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}
        title={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} mode`}
        aria-label="Toggle dark mode"
      >
        {resolved === 'dark' ? '☀' : '☾'}
      </button>
    );
  }

  return (
    <div className="theme-toggle" role="radiogroup" aria-label="Color theme">
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          className={theme === option.id ? 'active' : ''}
          onClick={() => setTheme(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
