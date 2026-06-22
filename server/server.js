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
const webhookRoutes = require('./routes/webhooks');
const adminRoutes = require('./routes/admin/index');
const adminProvidersRoutes = require('./routes/admin/providers');
const adminNumbersRoutes = require('./routes/admin/numbers');
const { db } = require('./config/database');
const { getProviderStatus } = require('./services/smsService');

if (!process.env.JWT_SECRET) {
  console.error('Missing JWT_SECRET. Set it in server/.env before starting the backend.');
  process.exit(1);
}

const app = express();

app.use(cors());
app.use(express.json());

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 });
app.use('/api/', limiter);

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/manual-sms', smsRoutes);
app.use('/api/numbers', numberRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/providers', adminProvidersRoutes);
app.use('/api/admin/numbers', adminNumbersRoutes);
app.use('/webhooks/vonage', webhookRoutes.router);

app.post('/webhooks/twilio/inbound', webhookRoutes.handlerTwilioInbound);
app.post('/webhooks/twilio/status', webhookRoutes.handlerTwilioStatus);

app.get('/api/health', (req, res) => {
  const provider = getProviderStatus();
  res.json({
    ok: true,
    mockSms: provider.mode === 'mock',
    providerMode: provider.mode,
    vonageConfigured: provider.configured,
    webhookSignatureConfigured: provider.signatureSecretConfigured,
    signedWebhookVerificationActive: provider.signedWebhookVerificationActive,
  });
});

app.use((err, req, res, next) => {
  if (!err.status || err.status >= 500) console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT} (SignalMint business texting workspace)`));
