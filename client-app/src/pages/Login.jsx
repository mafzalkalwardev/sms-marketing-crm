import { useState } from 'react';
import Button from '../components/Button';
import Input from '../components/Input';
import { useAuth } from '../auth/AuthContext';
import Logo from '../components/Logo';

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
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card auth-card-centered">
        <Logo />
        <h1>Welcome to SignalMint</h1>
        <p className="auth-lead">Simple business texting — inbox, contacts, and your phone numbers in one place.</p>

        <div className="auth-tabs">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Sign in</button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Create account</button>
        </div>

        <form onSubmit={submit} className="stack">
          {mode === 'register' && <Input label="Your name" name="name" required placeholder="Alex Johnson" />}
          <Input label="Email" name="email" type="email" required placeholder="you@company.com" />
          <Input label="Password" name="password" type="password" required placeholder="At least 6 characters" />
          {error && <div className="alert error">{error}</div>}
          <Button className="full" disabled={busy}>
            {busy ? 'One moment…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </Button>
        </form>
      </section>
    </main>
  );
}
