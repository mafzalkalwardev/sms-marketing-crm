import Topbar from '../components/Topbar';
import ThemeToggle from '../components/ThemeToggle';
import Button from '../components/Button';
import useWorkspace from '../hooks/useWorkspace';

export default function Settings({ setPage }) {
  const workspace = useWorkspace();

  return (
    <>
      <Topbar title="Settings" subtitle="Appearance and messaging preferences" />
      <section className="settings-stack">
        <article className="panel stack">
          <h3>Appearance</h3>
          <p className="muted-copy">Choose light, dark, or match your device.</p>
          <ThemeToggle />
        </article>

        <article className="panel stack">
          <h3>Your business lines</h3>
          <p className="muted-copy">
            {workspace.data?.hint || 'Assigned numbers route through the platform dialer automatically.'}
          </p>
          {!workspace.data?.lines?.length && (
            <p className="alert warn">No lines assigned yet. Ask your admin or add one under My numbers.</p>
          )}
          {workspace.data?.lines?.map((line) => (
            <div key={line.id} className="line-row">
              <div>
                <strong>{line.label}</strong>
                <small>{line.phone}</small>
              </div>
              {line.isDefault && <span className="badge active">Default</span>}
            </div>
          ))}
        </article>

        <article className="panel stack">
          <h3>Compliance</h3>
          <p className="muted-copy">View opt-outs, suppression list, and export STOP audit data.</p>
          {setPage && <Button variant="ghost" onClick={() => setPage('compliance')}>Open compliance</Button>}
        </article>

        <article className="panel stack">
          <h3>Notifications</h3>
          <label className="checkbox"><input type="checkbox" defaultChecked /> Show unread badges in inbox</label>
          <label className="checkbox"><input type="checkbox" defaultChecked /> Play sound on new reply (coming soon)</label>
        </article>
      </section>
    </>
  );
}
