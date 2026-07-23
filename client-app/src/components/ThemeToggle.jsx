import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { Button } from '@/components/ui/button';

export default function ThemeToggle({ compact = false }) {
  const { resolved, setTheme } = useTheme();
  const isDark = resolved === 'dark';
  return (
    <Button
      type="button"
      variant="ghost"
      size={compact ? 'icon' : 'sm'}
      aria-label="Toggle theme"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {!compact && <span>{isDark ? 'Light' : 'Dark'}</span>}
    </Button>
  );
}
