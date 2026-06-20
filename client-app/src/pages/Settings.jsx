import { api } from '../api/client';
import useAsync from '../hooks/useAsync';
import Topbar from '../components/Topbar';

export default function Settings() {
  const { data } = useAsync(() => api('/api/health'), []);
  return (
    <>
      <Topbar title="Settings" subtitle="Workspace, provider, and compliance" />
      <section className="two-column">
        <article className="panel stack">
          <h3>Vonage status</h3>
          <span className={`badge ${data?.mockSms ? 'warning' : 'active'}`}>{data?.mockSms ? 'Mock mode' : 'Configured'}</span>
          <p>Set `VONAGE_API_KEY`, `VONAGE_API_SECRET`, and `VONAGE_SENDER_NUMBER` in `server/.env`. Secrets are never displayed in the app.</p>
          <div className="code-box">POST /webhooks/vonage/inbound<br />POST /webhooks/vonage/status</div>
        </article>
        <article className="panel stack">
          <h3>Opt-out and compliance</h3>
          <label className="field"><span>Default send rate</span><input defaultValue="1 SMS/sec" readOnly /></label>
          <label className="field"><span>Daily cap</span><input defaultValue="Local MVP only" readOnly /></label>
          <label className="field"><span>Default sender</span><input defaultValue="From sender numbers" readOnly /></label>
          <div className="keyword-grid">{['STOP', 'UNSUBSCRIBE', 'REMOVE', 'CANCEL', 'END', 'QUIT', 'NO'].map((keyword) => <span key={keyword}>{keyword}</span>)}</div>
          <div className="check-list"><span>US 10DLC registration is required for many business texting use cases.</span><span>UK sender ID rules vary by route and provider approval.</span><span>Secrets stay in server environment variables and are never shown here.</span></div>
        </article>
      </section>
    </>
  );
}
