import Button from '../components/Button';
import Logo from '../components/Logo';

export default function Landing({ onSignIn }) {
  return (
    <main className="landing-page">
      <div className="landing-atmosphere" aria-hidden="true" />
      <header className="landing-top">
        <Logo brandName="SignalMint" />
        <Button variant="ghost" onClick={onSignIn}>Sign in</Button>
      </header>

      <section className="landing-hero">
        <p className="landing-brand">SignalMint</p>
        <h1>Business texting that looks like your brand</h1>
        <p className="landing-lead">
          Inbox, campaigns, and phone numbers in one dialer — built for teams that sell and support over SMS.
        </p>
        <div className="landing-cta">
          <Button onClick={onSignIn}>Open the dialer</Button>
          <Button variant="ghost" onClick={onSignIn}>Create account</Button>
        </div>
      </section>

      <section className="landing-proof">
        <h2>Built for live delivery</h2>
        <p>
          Super Admin connects Twilio, flips orgs to live, and sets message limits. Admins manage teams.
          Users send from a clean inbox — providers stay behind the scenes.
        </p>
      </section>

      <footer className="landing-foot">
        <span>© {new Date().getFullYear()} SignalMint</span>
        <button type="button" className="linkish" onClick={onSignIn}>Sign in to your workspace</button>
      </footer>
    </main>
  );
}
