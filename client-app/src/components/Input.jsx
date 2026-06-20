export default function Input({ label, children, className = '', ...props }) {
  return (
    <label className={`field ${className}`.trim()}>
      <span>{label}</span>
      {children || <input {...props} />}
    </label>
  );
}
