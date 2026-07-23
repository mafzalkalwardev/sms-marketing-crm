import { useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Button } from '@/components/ui/button';
import Logo from '../components/Logo';

gsap.registerPlugin(useGSAP, ScrollTrigger);

export default function Landing({ onSignIn }) {
  const rootRef = useRef(null);
  const reduce = useReducedMotion();

  useGSAP(
    () => {
      if (reduce) return;
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
        tl.from('.landing-brand', { y: 36, opacity: 0, duration: 0.8 })
          .from('.landing-headline', { y: 24, opacity: 0, duration: 0.6 }, '-=0.45')
          .from('.landing-lead', { y: 18, opacity: 0, duration: 0.5 }, '-=0.35')
          .from('.landing-cta', { y: 14, opacity: 0, duration: 0.45 }, '-=0.25');

        gsap.from('.landing-proof', {
          scrollTrigger: { trigger: '.landing-proof', start: 'top 85%' },
          y: 40,
          opacity: 0,
          duration: 0.7,
          ease: 'power2.out',
        });
      });
      return () => mm.revert();
    },
    { scope: rootRef, dependencies: [reduce] }
  );

  return (
    <main ref={rootRef} className="relative min-h-screen overflow-hidden bg-gradient-to-br from-indigo-50 via-slate-50 to-slate-200 dark:from-slate-950 dark:via-indigo-950 dark:to-slate-900">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(99,102,241,0.28),transparent_55%),radial-gradient(ellipse_at_top_right,rgba(129,140,248,0.2),transparent_50%)]"
      />

      <header className="relative z-10 flex items-center justify-between px-6 py-5 md:px-8">
        <Logo brandName="SignalMint" />
        <Button variant="ghost" onClick={onSignIn}>
          Sign in
        </Button>
      </header>

      <section className="relative z-10 flex min-h-[calc(100vh-88px)] max-w-3xl flex-col justify-center px-6 pb-16 md:px-8">
        <p className="landing-brand font-display text-5xl font-bold tracking-tight text-primary md:text-6xl">
          SignalMint
        </p>
        <h1 className="landing-headline mt-3 max-w-[18ch] font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          Business texting that looks like your brand
        </h1>
        <p className="landing-lead mt-4 max-w-[38ch] text-lg text-muted-foreground">
          Inbox, campaigns, and phone numbers in one dialer — built for teams that sell and support over SMS.
        </p>
        <div className="landing-cta mt-8 flex flex-wrap gap-3">
          <motion.div whileHover={reduce ? undefined : { scale: 1.03 }} whileTap={reduce ? undefined : { scale: 0.98 }}>
            <Button size="lg" onClick={onSignIn}>
              Open the dialer
            </Button>
          </motion.div>
          <Button size="lg" variant="ghost" onClick={onSignIn}>
            Create account
          </Button>
        </div>
      </section>

      <section className="landing-proof relative z-10 max-w-2xl border-t border-primary/20 px-6 py-12 md:px-8">
        <h2 className="font-display text-xl font-semibold">Built for live delivery</h2>
        <p className="mt-2 text-muted-foreground leading-relaxed">
          Super Admin connects Twilio, flips orgs to live, and sets message limits. Admins manage teams. Users
          send from a clean inbox — providers stay behind the scenes.
        </p>
      </section>

      <footer className="relative z-10 flex flex-wrap items-center justify-between gap-4 px-6 pb-8 text-sm text-muted-foreground md:px-8">
        <span>© {new Date().getFullYear()} SignalMint</span>
        <button type="button" className="font-semibold text-primary underline-offset-4 hover:underline" onClick={onSignIn}>
          Sign in to your workspace
        </button>
      </footer>
    </main>
  );
}
