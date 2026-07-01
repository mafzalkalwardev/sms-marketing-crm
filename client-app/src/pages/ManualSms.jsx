import Topbar from '../components/Topbar';
import ComposeForm from '../components/ComposeForm';

export default function ManualSms() {
  return (
    <>
      <Topbar title="New text" subtitle="Pick a contact or type a number, then send." />
      <section className="panel compose-panel">
        <ComposeForm />
      </section>
    </>
  );
}
