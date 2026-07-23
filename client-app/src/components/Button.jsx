import { Button as ShadButton } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const variantMap = {
  primary: 'default',
  ghost: 'ghost',
  secondary: 'secondary',
  danger: 'destructive',
};

export default function Button({ children, variant = 'primary', className = '', ...props }) {
  return (
    <ShadButton variant={variantMap[variant] || variant} className={cn(className)} {...props}>
      {children}
    </ShadButton>
  );
}
