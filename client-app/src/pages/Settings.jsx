import { api } from '../api/client';
import useAsync from '../hooks/useAsync';
import Topbar from '../components/Topbar';

export default function Settings() {
  const { data } = useAsync(() => api('/api/health'), []);
  return (
    <>
      <Topbar title="Settings" subtitle="Provider and workspace configuration" />
      <section className="two-column">
        <article className="panel stack">
          <h3>Vonage status</h3>
          <span className={`badge ${data?.mockSms ? 'warning' : 'active'}`}>{data?.mockSms ? 'Mock mode' : 'Configured'}</span>
          <p>Set `VONAGE_API_KEY`, `VONAGE_API_SECRET`, and `VONAGE_SENDER_NUMBER` in `server/.env`. Secrets are never displayed in the app.</p>
          <div className="code-box">POST /webhooks/vonage/inbound<br />POST /webhooks/vonage/status</div>
        </article>
        <article className="panel stack">
          <h3>Sending defaults</h3>
          <label className="field"><span>Default send rate</span><input defaultValue="1 SMS/sec" readOnly /></label>
          <label className="field"><span>Daily cap</span><input defaultValue="Local MVP only" readOnly /></label>
          <label className="field"><span>Default sender</span><input defaultValue="From sender numbers" readOnly /></label>
        </article>
      </section>
    </>
  );
}
