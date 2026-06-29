require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const contactRoutes = require('./routes/contacts');
const smsRoutes = require('./routes/sms');
const conversationRoutes = require('./routes/conversations');
const numberRoutes = require('./routes/numbers');
const campaignRoutes = require('./routes/campaigns');
const reportRoutes = require('./routes/reports');
const inboxRoutes = require('./routes/inbox');
const webhookRoutes = require('./routes/webhooks');
const adminRoutes = require('./routes/admin/index');
const superRoutes = require('./routes/super/index');
const { initDatabase } = require('./config/database');
const { bootstrapProvidersFromEnv } = require('./services/providerBootstrap');

if (!process.env.JWT_SECRET) {
  console.error('Missing JWT_SECRET. Set it in server/.env before starting the backend.');
  process.exit(1);
}

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 });
app.use('/api/', limiter);

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/inbox', inboxRoutes);
app.use('/api/manual-sms', smsRoutes);
app.use('/api/numbers', numberRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/super', superRoutes);
app.use('/webhooks/vonage', webhookRoutes.router);

app.post('/webhooks/twilio/inbound', webhookRoutes.handlerTwilioInbound);
app.post('/webhooks/twilio/status', webhookRoutes.handlerTwilioStatus);

app.get('/api/health', (req, res) => {
  res.json({ ok: true, version: '3.1.0', service: 'signalmint-api' });
});

app.use((err, req, res, next) => {
  if (!err.status || err.status >= 500) console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 5000;

async function start() {
  await initDatabase();
  await bootstrapProvidersFromEnv();
  const { queryOne } = require('./config/database');
  const existingUser = await queryOne('SELECT id FROM users LIMIT 1');
  if (!existingUser && process.env.AUTO_SEED !== 'false') {
    const { seed } = require('./scripts/seed-demo');
    await seed();
  }
  app.listen(PORT, () => console.log(`SignalMint API on port ${PORT} (PostgreSQL)`));
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
