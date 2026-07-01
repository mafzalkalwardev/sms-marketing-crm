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
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = Object.fromEntries(form.entries());
    body.is_default = form.get('is_default') === 'on';
    await api('/api/numbers', { method: 'POST', body });
    formElement.reset();
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
      <Topbar title="My numbers" subtitle="Add the phone numbers you send texts from." />
      <section className="split-layout">
        <form className="panel stack" onSubmit={create}>
          <h3>Add sender number</h3>
          <Input label="Phone number" name="phone_number" required placeholder="+15551234567" />
          <Input label="Label" name="label" placeholder="Sales line" />
          <div className="form-row">
            <Input label="Country"><select name="country" defaultValue="US"><option>US</option><option>UK</option></select></Input>
            <Input label="Type"><select name="type" defaultValue="long-code"><option value="long-code">Long code</option><option value="toll-free">Toll-free</option></select></Input>
          </div>
          <label className="checkbox"><input name="is_default" type="checkbox" /> Default sender</label>
          <Button>Add number</Button>
        </form>
        <section className="panel">
          <h3>Active senders</h3>
          {!numbers.data?.length && <EmptyState title="No numbers yet" text="Add a business sender number to start texting." />}
          {Boolean(numbers.data?.length) && (
            <table>
              <thead><tr><th>Number</th><th>Label</th><th>Country</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {numbers.data.map((number) => (
                  <tr key={number.id}>
                    <td>{number.phone_number}</td>
                    <td>{number.label || '—'}</td>
                    <td>{number.country}</td>
                    <td><span className={`badge ${number.status}`}>{number.is_default ? 'default' : number.status}</span></td>
                    <td className="row-actions">
                      <Button variant="ghost" onClick={() => setDefault(number)}>Default</Button>
                      <Button variant="danger" onClick={() => remove(number.id)}>Delete</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </section>
    </>
  );
}
