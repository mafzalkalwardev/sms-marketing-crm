import { api } from '../api/client';
import useAsync from '../hooks/useAsync';
import Topbar from '../components/Topbar';
import StatCard from '../components/StatCard';

export default function Reports() {
  const { data, error } = useAsync(() => api('/api/reports/dashboard'), []);
  return (
    <>
      <Topbar title="Reports" subtitle="Delivery, replies, and cost" />
      {error && <div className="alert error">{error}</div>}
      <section className="stat-grid">
        <StatCard label="Delivery rate" value={`${data?.deliveryRate || 0}%`} />
        <StatCard label="Reply rate" value={`${data?.replyRate || 0}%`} />
        <StatCard label="Estimated cost" value={`$${data?.totalCost || 0}`} />
        <StatCard label="Provider mode" value={data?.providerMode || 'mock'} />
      </section>
      <section className="panel">
        <h3>Report filters</h3>
        <div className="filters"><input type="date" /><input type="date" /><select><option>All campaigns</option></select><select><option>All statuses</option></select></div>
      </section>
    </>
  );
}
