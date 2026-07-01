import { useEffect } from 'react';
import { api } from '../api/client';
import useAsync from './useAsync';

function applyBrandingCss(branding) {
  if (!branding?.primaryColor) return;
  document.documentElement.style.setProperty('--brand', branding.primaryColor);
  document.documentElement.style.setProperty('--brand-dark', branding.primaryColor);
}

export default function useBranding() {
  const branding = useAsync(() => api('/api/user/branding'), []);

  useEffect(() => {
    if (branding.data) applyBrandingCss(branding.data);
  }, [branding.data]);

  return branding;
}
