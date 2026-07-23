import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function Modal({ title, children, onClose, wide = false, open = true }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose?.()}>
      <DialogContent className={cn(wide && 'max-w-2xl')}>
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 pr-6">
          <DialogTitle>{title}</DialogTitle>
          <Button variant="ghost" size="sm" type="button" onClick={onClose}>
            Close
          </Button>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
