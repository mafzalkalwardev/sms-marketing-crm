import { Input as ShadInput } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export default function Input({ label, children, className = '', ...props }) {
  return (
    <label className={cn('flex flex-col gap-1.5 text-sm', className)}>
      {label && <Label className="text-muted-foreground">{label}</Label>}
      {children || <ShadInput {...props} />}
    </label>
  );
}
