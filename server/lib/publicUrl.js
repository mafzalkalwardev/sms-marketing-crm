function resolvePublicBackendUrl() {
  const vercel = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';
  const candidates = [
    process.env.PUBLIC_BACKEND_URL,
    process.env.RENDER_EXTERNAL_URL,
    vercel,
  ].filter(Boolean);

  const raw = candidates[0] || '';
  const placeholder = !raw
    || raw.includes('your-ngrok-url')
    || raw.includes('your-backend-url');

  return {
    raw,
    ok: !placeholder,
    value: placeholder ? null : raw.replace(/\/$/, ''),
  };
}

module.exports = { resolvePublicBackendUrl };
