import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useAuth } from '../auth/AuthContext';
import Logo from '../components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const STEPS = {
  login: 'login',
  register: 'register',
  verifyEmail: 'verify_email',
  verifyPhone: 'verify_phone',
  pending: 'pending_approval',
};

function Field({ label, ...props }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input {...props} />
    </div>
  );
}

export default function Login({ onBack }) {
  const { login, register, verifyEmail, verifyPhone, resendOtp } = useAuth();
  const [step, setStep] = useState(STEPS.login);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const reduce = useReducedMotion();

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
      setNotice(result.message || 'Verification codes sent.');
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

  const motionProps = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -8 },
        transition: { duration: 0.25 },
      };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.22),transparent_40%),hsl(var(--background))] p-6">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          {onBack && (
            <button type="button" className="mb-2 text-left text-sm font-semibold text-primary hover:underline" onClick={onBack}>
              ← Back to SignalMint
            </button>
          )}
          <Logo />
          <CardTitle className="mt-3">Welcome to SignalMint</CardTitle>
          <CardDescription>Simple business texting — inbox, contacts, and numbers in one place.</CardDescription>
        </CardHeader>
        <CardContent>
          <AnimatePresence mode="wait">
            {(step === STEPS.login || step === STEPS.register) && (
              <motion.div key="auth-tabs" {...motionProps}>
                <Tabs
                  value={step === STEPS.register ? 'register' : 'login'}
                  onValueChange={(v) => {
                    setError('');
                    setStep(v === 'register' ? STEPS.register : STEPS.login);
                  }}
                >
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="login">Sign in</TabsTrigger>
                    <TabsTrigger value="register">Create account</TabsTrigger>
                  </TabsList>
                </Tabs>

                {step === STEPS.login && (
                  <form onSubmit={submitLogin} className="mt-4 space-y-3">
                    <Field label="Email" name="email" type="email" required placeholder="you@company.com" />
                    <Field label="Password" name="password" type="password" required placeholder="Your password" />
                    {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
                    <Button className="w-full" disabled={busy}>{busy ? 'One moment…' : 'Sign in'}</Button>
                  </form>
                )}

                {step === STEPS.register && (
                  <form onSubmit={submitRegister} className="mt-4 space-y-3">
                    <Field label="Your name" name="name" required placeholder="Alex Johnson" />
                    <Field label="Email" name="email" type="email" required placeholder="you@company.com" />
                    <Field label="Phone (E.164)" name="phone" required placeholder="+15551234567" />
                    <Field label="Password" name="password" type="password" required placeholder="At least 6 characters" />
                    <Field label="Org invite code (optional)" name="org_invite_code" placeholder="INV-XXXX" />
                    {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
                    {notice && <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">{notice}</div>}
                    <Button className="w-full" disabled={busy}>{busy ? 'One moment…' : 'Create account'}</Button>
                  </form>
                )}
              </motion.div>
            )}

            {step === STEPS.verifyEmail && (
              <motion.form key="email" onSubmit={submitVerifyEmail} className="space-y-3" {...motionProps}>
                <h2 className="font-display text-lg font-semibold">Verify your email</h2>
                <p className="text-sm text-muted-foreground">Enter the 6-digit code sent to {pendingEmail}</p>
                <Field label="Email code" name="code" required placeholder="123456" maxLength={6} />
                {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
                {notice && <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</div>}
                <Button className="w-full" disabled={busy}>Verify email</Button>
                <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={() => handleResend('email')}>Resend email code</Button>
              </motion.form>
            )}

            {step === STEPS.verifyPhone && (
              <motion.form key="phone" onSubmit={submitVerifyPhone} className="space-y-3" {...motionProps}>
                <h2 className="font-display text-lg font-semibold">Verify your phone</h2>
                <p className="text-sm text-muted-foreground">Enter the SMS code sent to your phone</p>
                <Field label="SMS code" name="code" required placeholder="123456" maxLength={6} />
                {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
                {notice && <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</div>}
                <Button className="w-full" disabled={busy}>Verify phone</Button>
                <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={() => handleResend('sms')}>Resend SMS code</Button>
              </motion.form>
            )}

            {step === STEPS.pending && (
              <motion.div key="pending" className="space-y-3" {...motionProps}>
                <h2 className="font-display text-lg font-semibold">Pending approval</h2>
                <p className="text-sm text-muted-foreground">Your account is verified. An administrator must approve it before you can sign in.</p>
                <Button onClick={() => setStep(STEPS.login)}>Back to sign in</Button>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </main>
  );
}
