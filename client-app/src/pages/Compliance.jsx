import Topbar from '../components/Topbar';

export default function Compliance() {
  const keywords = ['STOP', 'UNSUBSCRIBE', 'REMOVE', 'CANCEL', 'END', 'QUIT', 'NO'];
  return (
    <>
      <Topbar title="Compliance" subtitle="Consent, opt-outs, and country reminders" />
      <section className="two-column">
        <article className="panel">
          <h3>Compliance checklist</h3>
          <div className="check-list">
            <span>Send only to opted-in contacts.</span>
            <span>Always include opt-out text for marketing messages.</span>
            <span>STOP replies update contact and suppression status automatically.</span>
            <span>Manual SMS is blocked for unsubscribed contacts.</span>
          </div>
        </article>
        <article className="panel">
          <h3>Opt-out keywords</h3>
          <div className="keyword-grid">{keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div>
          <h3>US / UK reminders</h3>
          <p>US business SMS often requires 10DLC registration and approved campaign throughput. UK sending may require approved sender IDs depending on use case.</p>
        </article>
      </section>
    </>
  );
}
