import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, setUnauthorizedHandler } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user') || 'null'));
  const [loading, setLoading] = useState(Boolean(localStorage.getItem('token')));

  const clearSession = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const saveSession = (data) => {
    if (!data?.token) return data;
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    return data;
  };

  useEffect(() => {
    setUnauthorizedHandler(clearSession);
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    api('/api/auth/me')
      .then((me) => {
        localStorage.setItem('user', JSON.stringify(me));
        setUser(me);
      })
      .catch(clearSession)
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    login: async (payload) => saveSession(await api('/api/auth/login', { method: 'POST', body: payload })),
    register: async (payload) => api('/api/auth/register', { method: 'POST', body: payload }),
    verifyEmail: async (payload) => api('/api/auth/verify-email', { method: 'POST', body: payload }),
    verifyPhone: async (payload) => api('/api/auth/verify-phone', { method: 'POST', body: payload }),
    resendOtp: async (payload) => api('/api/auth/resend-otp', { method: 'POST', body: payload }),
    logout: async () => {
      try {
        await api('/api/auth/logout', { method: 'POST' });
      } catch {
        /* ignore */
      }
      clearSession();
    },
    endImpersonation: async () => {
      const data = await api('/api/super/users/impersonate/end', { method: 'POST' });
      saveSession(data);
      return data;
    },
    saveSession,
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
