import { api } from '../api/client';
import useAsync from '../hooks/useAsync';
import Topbar from '../components/Topbar';
import Button from '../components/Button';
import Input from '../components/Input';
import EmptyState from '../components/EmptyState';

export default function Numbers() {
  const numbers = useAsync(() => api('/api/numbers'), []);
  const create = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    body.is_default = form.get('is_default') === 'on';
    await api('/api/numbers', { method: 'POST', body });
    event.currentTarget.reset();
    numbers.refresh();
  };
  const setDefault = async (number) => {
    await api(`/api/numbers/${number.id}`, { method: 'PUT', body: { ...number, is_default: true } });
    numbers.refresh();
  };
  const remove = async (id) => {
    await api(`/api/numbers/${id}`, { method: 'DELETE' });
    numbers.refresh();
  };
  return (
    <>
      <Topbar title="Sender numbers" subtitle="Provider identity" />
      <section className="split-layout">
        <form className="panel stack" onSubmit={create}>
          <h3>Add sender number</h3>
          <Input label="Phone number" name="phone_number" required placeholder="+15551234567" />
          <Input label="Provider"><select name="provider" defaultValue="vonage"><option>vonage</option><option>mock</option></select></Input>
          <div className="form-row"><Input label="Country"><select name="country" defaultValue="US"><option>US</option><option>UK</option></select></Input><Input label="Type"><select name="type" defaultValue="long-code"><option value="long-code">Long code</option><option value="toll-free">Toll-free</option><option value="short-code">Short code</option></select></Input></div>
          <label className="checkbox"><input name="is_default" type="checkbox" /> Default sender</label>
          <Button>Add number</Button>
        </form>
        <section className="panel">
          <h3>Active senders</h3>
          {!numbers.data?.length && <EmptyState title="No numbers yet" text="Add a Vonage or mock sender number." />}
          {Boolean(numbers.data?.length) && <table><thead><tr><th>Number</th><th>Provider</th><th>Country</th><th>Type</th><th>Status</th><th></th></tr></thead><tbody>{numbers.data.map((number) => <tr key={number.id}><td>{number.phone_number}</td><td>{number.provider}</td><td>{number.country}</td><td>{number.type}</td><td><span className={`badge ${number.status}`}>{number.is_default ? 'default' : number.status}</span></td><td className="row-actions"><Button variant="ghost" onClick={() => setDefault(number)}>Default</Button><Button variant="danger" onClick={() => remove(number.id)}>Delete</Button></td></tr>)}</tbody></table>}
        </section>
      </section>
    </>
  );
}
