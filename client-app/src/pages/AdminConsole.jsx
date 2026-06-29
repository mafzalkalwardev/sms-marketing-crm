import Topbar from '../components/Topbar';

export default function AdminConsole() {
  return (
    <>
      <Topbar title="Admin Console" subtitle="Manage your organization users and numbers" />
      <section className="stat-grid admin-stats">
        <article className="stat-card"><span>Users</span><strong>Your team</strong><small>Assign numbers from your pool</small></article>
        <article className="stat-card"><span>Numbers</span><strong>Sender lines</strong><small>Configure under Numbers</small></article>
        <article className="stat-card"><span>Messages</span><strong>Inbox</strong><small>Two-way texting workspace</small></article>
        <article className="stat-card"><span>Compliance</span><strong>STOP handling</strong><small>Automatic unsubscribe detection</small></article>
      </section>
      <section className="panel">
        <h3>Organization admin</h3>
        <p>Use Contacts, Numbers, and Messages to run your team texting workspace. Backend routing is managed by the platform operator.</p>
      </section>
    </>
  );
}
