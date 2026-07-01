export default function Logo({ compact = false, brandName = 'SignalMint', tagline = 'Business texting workspace' }) {
  return (
    <div className={`logo ${compact ? 'compact' : ''}`} aria-label={brandName}>
      <svg className="logo-mark" viewBox="0 0 48 48" role="img" aria-hidden="true">
        <rect x="5" y="8" width="34" height="26" rx="10" />
        <path d="M16 22h13M16 16h8" />
        <path d="M25 34l-7 7v-8" />
        <path className="wave" d="M39 15c3 2 5 5 5 9s-2 7-5 9" />
      </svg>
      {!compact && (
        <span>
          <strong>{brandName}</strong>
          <small>{tagline}</small>
        </span>
      )}
    </div>
  );
}
