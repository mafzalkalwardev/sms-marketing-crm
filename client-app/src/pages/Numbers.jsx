import { api } from '../api/client';
import useAsync from '../hooks/useAsync';
import Topbar from '../components/Topbar';
import Button from '../components/Button';
import Input from '../components/Input';
import EmptyState from '../components/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const selectClassName =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

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
    <div className="space-y-4 pb-20 md:pb-6">
      <Topbar title="My numbers" subtitle="Add the phone numbers you send texts from." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Add sender number</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={create}>
              <Input label="Phone number" name="phone_number" required placeholder="+15551234567" />
              <Input label="Label" name="label" placeholder="Sales line" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Country">
                  <select name="country" defaultValue="US" className={selectClassName}>
                    <option>US</option>
                    <option>UK</option>
                  </select>
                </Input>
                <Input label="Type">
                  <select name="type" defaultValue="long-code" className={selectClassName}>
                    <option value="long-code">Long code</option>
                    <option value="toll-free">Toll-free</option>
                  </select>
                </Input>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input name="is_default" type="checkbox" className="h-4 w-4 rounded border-input" />
                Default sender
              </label>
              <Button>Add number</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Active senders</CardTitle>
          </CardHeader>
          <CardContent>
            {!numbers.data?.length && (
              <EmptyState title="No numbers yet" text="Add a business sender number to start texting." />
            )}
            {Boolean(numbers.data?.length) && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Number</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {numbers.data.map((number) => (
                    <TableRow key={number.id}>
                      <TableCell className="font-medium">{number.phone_number}</TableCell>
                      <TableCell>{number.label || '—'}</TableCell>
                      <TableCell>{number.country}</TableCell>
                      <TableCell>
                        <Badge variant={number.is_default ? 'default' : 'secondary'}>
                          {number.is_default ? 'default' : number.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setDefault(number)}>Default</Button>
                          <Button variant="danger" size="sm" onClick={() => remove(number.id)}>Delete</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
