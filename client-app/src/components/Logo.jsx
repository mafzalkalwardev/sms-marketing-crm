import { cn } from '@/lib/utils';

export default function Logo({ brandName = 'SignalMint', className }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden className="shrink-0">
        <rect width="32" height="32" rx="8" className="fill-primary" />
        <path d="M8 18c4-8 12-10 16-8-3 6-8 10-16 10z" fill="white" opacity="0.95" />
      </svg>
      <span className="font-display text-base font-semibold tracking-tight">{brandName}</span>
    </div>
  );
}
