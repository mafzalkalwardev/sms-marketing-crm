import { useState } from 'react';
import Button from '../components/Button';
import Input from '../components/Input';
import { useAuth } from '../auth/AuthContext';

export default function Login() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const payload = {
        name: form.get('name'),
        email: form.get('email'),
        password: form.get('password'),
      };
      if (mode === 'login') await login({ email: payload.email, password: payload.password });
      else await register(payload);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-hero">
        <p className="eyebrow">Compliant SMS CRM</p>
        <h1>Business texting, campaigns, replies, and opt-outs in one workspace.</h1>
        <p>SignalMint gives small teams an OpenPhone-style messaging workflow with consent tracking, Vonage-ready sends, mock mode for local testing, and campaign analytics.</p>
        <div className="proof-grid">
          <span>Dialpad-style SMS</span>
          <span>Two-way inbox</span>
          <span>STOP automation</span>
          <span>Campaign planner</span>
        </div>
      </section>
      <section className="auth-card">
        <div className="auth-tabs">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Login</button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Register</button>
        </div>
        <form onSubmit={submit} className="stack">
          {mode === 'register' && <Input label="Name" name="name" required placeholder="Muhammad Afzal" />}
          <Input label="Email" name="email" type="email" required placeholder="you@company.com" />
          <Input label="Password" name="password" type="password" required placeholder="At least 6 characters" />
          {error && <div className="alert error">{error}</div>}
          <Button className="full" disabled={busy}>{busy ? 'Please wait...' : mode === 'login' ? 'Login to workspace' : 'Create workspace'}</Button>
        </form>
      </section>
    </main>
  );
}
