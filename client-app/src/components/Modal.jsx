import Button from './Button';

export default function Modal({ title, children, onClose, wide = false }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className={`modal ${wide ? 'modal-wide' : ''}`}>
        <div className="modal-header">
          <h3>{title}</h3>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
        {children}
      </div>
    </div>
  );
}
