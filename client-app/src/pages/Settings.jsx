import Topbar from '../components/Topbar';

export default function Settings() {
  return (
    <>
      <Topbar title="Settings" subtitle="Account preferences and notification defaults" />
      <section className="two-column">
        <article className="panel stack">
          <h3>Profile</h3>
          <label className="field"><span>Name</span><input defaultValue="" placeholder="Your name" /></label>
          <label className="field"><span>Email</span><input defaultValue="" placeholder="you@example.com" /></label>
          <label className="field"><span>Default assigned line</span><select defaultValue=""><option value="">Use account default</option></select></label>
        </article>
        <article className="panel stack">
          <h3>Security and notifications</h3>
          <label className="field"><span>Current password</span><input type="password" /></label>
          <label className="field"><span>New password</span><input type="password" /></label>
          <label className="checkbox"><input type="checkbox" defaultChecked /> Email me when a customer replies</label>
          <label className="checkbox"><input type="checkbox" defaultChecked /> Show unread conversation badges</label>
        </article>
      </section>
    </>
  );
}
