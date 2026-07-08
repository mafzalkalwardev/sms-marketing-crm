require('dotenv').config({ override: true });
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
const messageRoutes = require('./routes/messages');
const webhookRoutes = require('./routes/webhooks');
const adminRoutes = require('./routes/admin/index');
const superRoutes = require('./routes/super/index');
const internalWorkerRoutes = require('./routes/internal/worker');
const { initDatabase } = require('./config/database');
const { bootstrapProvidersFromEnv } = require('./services/providerBootstrap');
const webhookProcessor = require('./services/webhookProcessor');

if (!process.env.JWT_SECRET) {
  console.error('Missing JWT_SECRET. Set it in server/.env before starting the backend.');
  process.exit(1);
}

let bootPromise = null;

function ensureBooted() {
  if (!bootPromise) {
    bootPromise = (async () => {
      await initDatabase();
      await bootstrapProvidersFromEnv();
      const { queryOne } = require('./config/database');
      const existingUser = await queryOne('SELECT id FROM users LIMIT 1');
      if (!existingUser && process.env.AUTO_SEED !== 'false') {
        const { seed } = require('./scripts/seed-demo');
        await seed();
      }
    })();
  }
  return bootPromise;
}

const app = express();

app.use(async (req, res, next) => {
  try {
    await ensureBooted();
    next();
  } catch (err) {
    next(err);
  }
});

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
app.use('/api/messages', messageRoutes);
app.use('/api/manual-sms', smsRoutes);
app.use('/api/numbers', numberRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/compliance', require('./routes/compliance'));
app.use('/api/v1', require('./routes/v1'));
app.use('/api/admin', adminRoutes);
app.use('/api/super', superRoutes);
app.use('/internal/worker', internalWorkerRoutes);
app.use('/webhooks/vonage', webhookRoutes.router);

app.post('/webhooks/twilio/inbound', webhookRoutes.verifyTwilioWebhook, webhookRoutes.handlerTwilioInbound);
app.post('/webhooks/twilio/status', webhookRoutes.verifyTwilioWebhook, webhookRoutes.handlerTwilioStatus);
app.post('/webhooks/mock/inbound', webhookRoutes.handlerMockInbound);
app.post('/webhooks/mock/status', webhookRoutes.handlerMockStatus);

for (const providerId of webhookProcessor.API_WEBHOOK_PROVIDERS) {
  if (['vonage', 'twilio', 'mock'].includes(providerId)) continue;
  const handler = webhookRoutes.createProviderWebhookHandler(providerId);
  app.post(`/webhooks/${providerId}/inbound`, handler);
  app.post(`/webhooks/${providerId}/status`, handler);
}

app.get('/', (req, res) => {
  res.json({
    service: 'SignalMint API',
    ok: true,
    version: '3.4.0',
    health: '/api/health',
    docs: 'Use the React client for the dialer UI. API routes are under /api/*',
  });
});

app.get('/api/health', async (req, res) => {
  try {
    const { queryOne } = require('./config/database');
    await queryOne('SELECT 1 AS ok');
    res.json({
      ok: true,
      version: '3.4.0',
      queue: process.env.REDIS_URL ? 'bullmq' : 'memory',
    });
  } catch {
    res.status(503).json({ ok: false, version: '3.3.0' });
  }
});

app.use((err, req, res, next) => {
  if (!err.status || err.status >= 500) console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 5000;

async function start() {
  await ensureBooted();
  const { startBrowserPollScheduler } = require('./services/browserPollScheduler');
  const { startCampaignQueue } = require('./services/campaignQueue');
  const { startProviderHealthScheduler } = require('./services/providerHealthScheduler');
  const { startRetentionScheduler } = require('./services/retentionService');
  startBrowserPollScheduler();
  startCampaignQueue();
  startProviderHealthScheduler();
  startRetentionScheduler();
  app.listen(PORT, () => console.log(`SignalMint API on port ${PORT} (PostgreSQL)`));
}

module.exports = app;
module.exports.ensureBooted = ensureBooted;

if (require.main === module) {
  start().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
