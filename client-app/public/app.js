const api = (path, opts = {}) => fetch(`http://localhost:5000${path}`, {
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}`, ...opts.headers },
  body: opts.body ? JSON.stringify(opts.body) : undefined,
  method: opts.method || 'GET',
}).then(r => r.json());

function useAuth() {
  const [user, setUser] = React.useState(JSON.parse(localStorage.getItem('user') || 'null'));
  const login = async (e) => {
    e.preventDefault();
    const data = await api('/api/auth/login', { method: 'POST', body: { email: e.target.email.value, password: e.target.password.value } });
    if (data.token) { localStorage.setItem('token', data.token); localStorage.setItem('user', JSON.stringify(data.user)); setUser(data.user); }
  };
  const register = async (e) => {
    e.preventDefault();
    const data = await api('/api/auth/register', { method: 'POST', body: { name: e.target.name.value, email: e.target.email.value, password: e.target.password.value } });
    if (data.token) { localStorage.setItem('token', data.token); localStorage.setItem('user', JSON.stringify(data.user)); setUser(data.user); }
  };
  const logout = () => { localStorage.clear(); setUser(null); };
  return { user, login, register, logout };
}

function Nav({ page, setPage, user, logout }) {
  return <nav style={navStyle}>
    <strong>SMS CRM</strong>
    <div>
      <button style={btnStyle} onClick={() => setPage('dashboard')}>Dashboard</button>
      <button style={btnStyle} onClick={() => setPage('contacts')}>Contacts</button>
      <button style={btnStyle} onClick={() => setPage('manual')}>Manual SMS</button>
      <button style={btnStyle} onClick={() => setPage('campaigns')}>Campaigns</button>
      <button style={btnStyle} onClick={() => setPage('inbox')}>Inbox</button>
      <button style={btnStyle} onClick={() => setPage('numbers')}>Numbers</button>
      <span style={{marginLeft:10}}>{user?.name}</span>
      <button style={btnStyle} onClick={logout}>Logout</button>
    </div>
  </nav>;
}

function Login({ onLogin }) {
  const { login, register } = useAuth();
  const [mode, setMode] = React.useState('login');
  const submit = mode === 'login' ? login : register;
  return <div style={centerStyle}>
    <form onSubmit={submit} style={cardStyle}>
      <h2>{mode === 'login' ? 'Login' : 'Register'}</h2>
      {mode === 'register' && <input name="name" placeholder="Name" required style={inputStyle} />}
      <input name="email" type="email" placeholder="Email" required style={inputStyle} />
      <input name="password" type="password" placeholder="Password" required style={inputStyle} />
      <button type="submit" style={primaryBtn}>{mode === 'login' ? 'Login' : 'Register'}</button>
      <button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')} style={textBtn}>
        {mode === 'login' ? 'Need an account? Register' : 'Have an account? Login'}
      </button>
    </form>
  </div>;
}

function Dashboard() {
  const [stats, setStats] = React.useState({});
  React.useEffect(() => { api('/api/reports/dashboard').then(setStats); }, []);
  return <div style={pageStyle}>
    <h2>Dashboard</h2>
    <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12}}>
      {[
        ['Total Contacts', stats.totalContacts],
        ['Opted In', stats.optedIn],
        ['Unsubscribed', stats.unsubscribed],
        ['Sent Today', stats.sentToday],
        ['Replies Today', stats.repliesToday],
        ['Failed', stats.failed],
        ['Campaigns', stats.campaigns],
      ].map(([label, value]) => <div key={label} style={cardStyle}><h4>{label}</h4><p style={{fontSize:24}}>{value ?? '…'}</p></div>)}
    </div>
  </div>;
}

function Contacts() {
  const [contacts, setContacts] = React.useState([]);
  const [form, setForm] = React.useState({ name:'', phone:'', country:'US', consent_status:'unknown' });
  React.useEffect(() => { api('/api/contacts').then(setContacts); }, []);
  const add = async (e) => { e.preventDefault(); const data = await api('/api/contacts', {method:'POST', body: form}); if (data.id) setContacts([...contacts, {...form, id: data.id}]); setForm({name:'', phone:'', country:'US', consent_status:'unknown'}); };
  const remove = async (id) => { await api(`/api/contacts/${id}`, {method:'DELETE'}); setContacts(contacts.filter(c => c.id !== id)); };
  return <div style={pageStyle}>
    <h2>Contacts</h2>
    <form onSubmit={add} style={{marginBottom:20}}>
      <input style={inputStyle} placeholder="Name" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
      <input style={inputStyle} placeholder="Phone" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
      <select style={inputStyle} value={form.country} onChange={e => setForm({...form, country: e.target.value})}><option>US</option><option>UK</option></select>
      <button type="submit" style={primaryBtn}>Add</button>
    </form>
    <table style={tableStyle}><thead><tr><th>Name</th><th>Phone</th><th>Country</th><th>Consent</th><th></th></tr></thead>
    <tbody>{contacts.map(c => <tr key={c.id}><td>{c.name}</td><td>{c.phone}</td><td>{c.country}</td><td>{c.consent_status}</td><td><button onClick={() => remove(c.id)} style={dangerBtn}>Delete</button></td></tr>)}</tbody></table>
  </div>;
}

function ManualSMS() {
  const [contacts, setContacts] = React.useState([]);
  const [form, setForm] = React.useState({ to: '', message: '', from: '' });
  const [result, setResult] = React.useState('');
  React.useEffect(() => { api('/api/contacts').then(setContacts); }, []);
  const send = async (e) => { e.preventDefault(); const data = await api('/api/manual-sms/send', {method:'POST', body: form}); setResult(data.error || 'Sent!'); setTimeout(() => setResult(''), 2000); };
  const chars = form.message.length;
  const segments = chars <= 160 ? 1 : Math.ceil(chars / 153);
  return <div style={pageStyle}>
    <h2>Manual SMS</h2>
    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:20}}>
      <form onSubmit={send} style={cardStyle}>
        <input style={inputStyle} placeholder="From (optional)" value={form.from} onChange={e => setForm({...form, from: e.target.value})} />
        <input style={inputStyle} placeholder="To number (+1555...)" value={form.to} onChange={e => setForm({...form, to: e.target.value})} />
        <select style={inputStyle} onChange={e => setForm({...form, to: e.target.value})}><option value="">Pick contact</option>{contacts.map(c => <option key={c.id} value={c.phone}>{c.name} - {c.phone}</option>)}</select>
        <textarea style={{...inputStyle, height:120}} placeholder="Message" value={form.message} onChange={e => setForm({...form, message: e.target.value})} />
        <div style={{display:'flex', gap:10}}><span>Chars: {chars}</span><span>Segments: {segments}</span></div>
        <button type="submit" style={primaryBtn}>Send SMS</button>
        {result && <p style={{color: result === 'Sent!' ? 'green' : 'red'}}>{result}</p>}
      </form>
      <div style={cardStyle}>
        <h4>Recent Messages</h4>
        <p style={{color:'#666'}}>Replies will appear here once Vonage webhook is configured.</p>
      </div>
    </div>
  </div>;
}

function Campaigns() {
  const [list, setList] = React.useState([]);
  const [form, setForm] = React.useState({ title:'', message_template:'', send_rate:1 });
  React.useEffect(() => { api('/api/campaigns').then(setList); }, []);
  const create = async (e) => { e.preventDefault(); const data = await api('/api/campaigns', {method:'POST', body: form}); if (data.id) setList([...list, {...form, id: data.id, status:'draft'}]); setForm({title:'', message_template:'', send_rate:1}); };
  return <div style={pageStyle}>
    <h2>Campaigns</h2>
    <form onSubmit={create} style={cardStyle}>
      <h4>Create Campaign</h4>
      <input style={inputStyle} placeholder="Campaign title" value={form.title} onChange={e => setForm({...form, title: e.target.value})} />
      <textarea style={{...inputStyle, height:80}} placeholder="Message template (use {{name}})" value={form.message_template} onChange={e => setForm({...form, message_template: e.target.value})} />
      <input type="number" style={inputStyle} placeholder="Send rate (sms/sec)" value={form.send_rate} onChange={e => setForm({...form, send_rate: parseInt(e.target.value)})} />
      <button type="submit" style={primaryBtn}>Create Campaign</button>
    </form>
    {list.map(c => <div key={c.id} style={cardStyle}><strong>{c.title}</strong><span style={{float:'right', padding: '4px 8px', background: '#e0e0e0', borderRadius: 4}}>{c.status}</span><p>{c.message_template}</p><small>Rate: {c.send_rate}/sec</small></div>)}
  </div>;
}

function Inbox() {
  const [convs, setConvs] = React.useState([]);
  const [selected, setSelected] = React.useState(null);
  const [reply, setReply] = React.useState('');
  React.useEffect(() => { api('/api/inbox/conversations').then(setConvs); }, []);
  const sendReply = async () => {
    if (!selected || !reply) return;
    await api(`/api/inbox/conversations/${selected}/reply`, {method:'POST', body: {message: reply}});
    setReply('');
  };
  return <div style={{display:'grid', gridTemplateColumns:'1fr 2fr', gap:20, height:'70vh'}}>
    <div style={{borderRight:'1px solid #ddd'}}>
      <h3>Conversations</h3>
      {convs.map(c => <div key={c.contact_id} onClick={() => setSelected(c.contact_id)} style={{padding:8, cursor:'pointer', background: selected === c.contact_id ? '#e8f0fe' : '#fff'}}>
        <strong>{c.name}</strong><br/><small>{c.phone}</small>
      </div>)}
    </div>
    <div>
      {selected ? <div><h3>Chat</h3><p style={{color:'#666'}}>Messages load here when webhooks deliver replies.</p>
      <textarea style={{...inputStyle, height:100}} value={reply} onChange={e => setReply(e.target.value)} placeholder="Type reply..." />
      <button onClick={sendReply} style={primaryBtn}>Send</button></div> : <p style={{color:'#666'}}>Select a conversation</p>}
    </div>
  </div>;
}

function Numbers() {
  const [nums, setNums] = React.useState([]);
  const [form, setForm] = React.useState({ phone_number:'', country:'US', type:'long-code' });
  React.useEffect(() => { api('/api/numbers').then(setNums); }, []);
  const add = async (e) => { e.preventDefault(); const data = await api('/api/numbers', {method:'POST', body: form}); if (data.id) setNums([...nums, {...form, id: data.id}]); setForm({phone_number:'', country:'US', type:'long-code'}); };
  return <div style={pageStyle}>
    <h2>Sender Numbers</h2>
    <form onSubmit={add} style={cardStyle}>
      <input style={inputStyle} placeholder="+15551234567" value={form.phone_number} onChange={e => setForm({...form, phone_number: e.target.value})} />
      <select style={inputStyle} value={form.country} onChange={e => setForm({...form, country: e.target.value})}><option>US</option><option>UK</option></select>
      <button type="submit" style={primaryBtn}>Add Number</button>
    </form>
    {nums.map(n => <div key={n.id} style={cardStyle}><strong>{n.phone_number}</strong> <span style={{padding:'2px 6px', background:'#e0e0e0', borderRadius:4}}>{n.status}</span></div>)}
  </div>;
}

const navStyle = { display:'flex', justifyContent:'space-between', padding:'12px 20px', background:'#1a73e8', color:'#fff', alignItems:'center' };
const btnStyle = { marginLeft:8, padding:'6px 12px', border:'none', borderRadius:4, background:'rgba(255,255,255,0.2)', color:'#fff', cursor:'pointer' };
const centerStyle = { display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', background:'#f0f2f5' };
const cardStyle = { background:'#fff', padding:20, borderRadius:8, boxShadow:'0 1px 3px rgba(0,0,0,0.1)', marginBottom:12 };
const primaryBtn = { padding:'8px 16px', border:'none', borderRadius:4, background:'#1a73e8', color:'#fff', cursor:'pointer', marginRight:8 };
const textBtn = { padding:'8px 16px', border:'none', background:'transparent', color:'#1a73e8', cursor:'pointer' };
const dangerBtn = { padding:'4px 8px', border:'none', borderRadius:4, background:'#d93025', color:'#fff', cursor:'pointer' };
const inputStyle = { padding:8, margin:'4px 0', width:'100%', boxSizing:'border-box', border:'1px solid #ddd', borderRadius:4 };
const pageStyle = { padding:20, maxWidth: 1200, margin:'0 auto' };
const tableStyle = { width:'100%', borderCollapse:'collapse' };

function App() {
  const { user, login, register, logout } = useAuth();
  const [page, setPage] = React.useState('login');
  if (!user) return <Login onLogin={() => {}} />;
  return <div>
    <Nav page={page} setPage={setPage} user={user} logout={logout} />
    <div style={{padding:20}}>{page === 'dashboard' && <Dashboard />}{page === 'contacts' && <Contacts />}{page === 'manual' && <ManualSMS />}{page === 'campaigns' && <Campaigns />}{page === 'inbox' && <Inbox />}{page === 'numbers' && <Numbers />}</div>
  </div>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);