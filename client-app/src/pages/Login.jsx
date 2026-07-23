import { useState } from 'react';
import Button from '../components/Button';
import Input from '../components/Input';
import { useAuth } from '../auth/AuthContext';
import Logo from '../components/Logo';

const STEPS = {
  login: 'login',
  register: 'register',
  verifyEmail: 'verify_email',
  verifyPhone: 'verify_phone',
  pending: 'pending_approval',
};

export default function Login({ onBack }) {
  const { login, register, verifyEmail, verifyPhone, resendOtp } = useAuth();
  const [step, setStep] = useState(STEPS.login);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');

  const submitLogin = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await login({ email: form.get('email'), password: form.get('password') });
    } catch (err) {
      if (err.message?.includes('pending_verification')) {
        setPendingEmail(String(form.get('email')));
        setStep(STEPS.verifyEmail);
      } else if (err.message?.includes('pending approval')) {
        setStep(STEPS.pending);
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const submitRegister = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const email = String(form.get('email'));
      const result = await register({
        name: form.get('name'),
        email,
        password: form.get('password'),
        phone: form.get('phone'),
        org_invite_code: form.get('org_invite_code') || undefined,
      });
      setPendingEmail(email);
      setNotice(result.message || 'Verification codes sent. Check email and SMS (dev: server console).');
      setStep(STEPS.verifyEmail);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitVerifyEmail = async (event) => {
    event.preventDefault();
    const code = new FormData(event.currentTarget).get('code');
    setBusy(true);
    setError('');
    try {
      const result = await verifyEmail({ email: pendingEmail, code });
      if (result.nextStep === 'verify_phone') setStep(STEPS.verifyPhone);
      else if (result.nextStep === 'pending_approval') setStep(STEPS.pending);
      else setStep(STEPS.login);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitVerifyPhone = async (event) => {
    event.preventDefault();
    const code = new FormData(event.currentTarget).get('code');
    setBusy(true);
    setError('');
    try {
      const result = await verifyPhone({ email: pendingEmail, code });
      if (result.nextStep === 'pending_approval') setStep(STEPS.pending);
      else setStep(STEPS.login);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async (channel) => {
    setBusy(true);
    setError('');
    try {
      await resendOtp({ email: pendingEmail, channel });
      setNotice(`New ${channel} code sent.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card auth-card-centered">
        {onBack && (
          <button type="button" className="linkish auth-back" onClick={onBack}>← Back to SignalMint</button>
        )}
        <Logo />
        <h1>Welcome to SignalMint</h1>
        <p className="auth-lead">Simple business texting — inbox, contacts, and your phone numbers in one place.</p>

        {step === STEPS.login && (
          <>
            <div className="auth-tabs">
              <button type="button" className="active">Sign in</button>
              <button type="button" onClick={() => { setStep(STEPS.register); setError(''); }}>Create account</button>
            </div>
            <form onSubmit={submitLogin} className="stack">
              <Input label="Email" name="email" type="email" required placeholder="you@company.com" />
              <Input label="Password" name="password" type="password" required placeholder="Your password" />
              {error && <div className="alert error">{error}</div>}
              <Button className="full" disabled={busy}>{busy ? 'One moment…' : 'Sign in'}</Button>
            </form>
          </>
        )}

        {step === STEPS.register && (
          <>
            <div className="auth-tabs">
              <button type="button" onClick={() => { setStep(STEPS.login); setError(''); }}>Sign in</button>
              <button type="button" className="active">Create account</button>
            </div>
            <form onSubmit={submitRegister} className="stack">
              <Input label="Your name" name="name" required placeholder="Alex Johnson" />
              <Input label="Email" name="email" type="email" required placeholder="you@company.com" />
              <Input label="Phone (E.164)" name="phone" required placeholder="+15551234567" />
              <Input label="Password" name="password" type="password" required placeholder="At least 6 characters" />
              <Input label="Org invite code (optional)" name="org_invite_code" placeholder="INV-XXXX" />
              {error && <div className="alert error">{error}</div>}
              {notice && <div className="alert success">{notice}</div>}
              <Button className="full" disabled={busy}>{busy ? 'One moment…' : 'Create account'}</Button>
            </form>
          </>
        )}

        {step === STEPS.verifyEmail && (
          <form onSubmit={submitVerifyEmail} className="stack">
            <h2>Verify your email</h2>
            <p className="muted-copy">Enter the 6-digit code sent to {pendingEmail}</p>
            <Input label="Email code" name="code" required placeholder="123456" maxLength={6} />
            {error && <div className="alert error">{error}</div>}
            {notice && <div className="alert success">{notice}</div>}
            <Button className="full" disabled={busy}>Verify email</Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => handleResend('email')}>Resend email code</Button>
          </form>
        )}

        {step === STEPS.verifyPhone && (
          <form onSubmit={submitVerifyPhone} className="stack">
            <h2>Verify your phone</h2>
            <p className="muted-copy">Enter the SMS code sent to your phone</p>
            <Input label="SMS code" name="code" required placeholder="123456" maxLength={6} />
            {error && <div className="alert error">{error}</div>}
            {notice && <div className="alert success">{notice}</div>}
            <Button className="full" disabled={busy}>Verify phone</Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => handleResend('sms')}>Resend SMS code</Button>
          </form>
        )}

        {step === STEPS.pending && (
          <div className="stack">
            <h2>Pending approval</h2>
            <p>Your account has been verified. An administrator must approve your account before you can sign in.</p>
            <Button onClick={() => setStep(STEPS.login)}>Back to sign in</Button>
          </div>
        )}
      </section>
    </main>
  );
}
