require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth');
const contactRoutes = require('./routes/contacts');
const smsRoutes = require('./routes/sms');
const campaignRoutes = require('./routes/campaigns');
const inboxRoutes = require('./routes/inbox');
const numberRoutes = require('./routes/numbers');
const reportRoutes = require('./routes/reports');
const webhookRoutes = require('./routes/webhooks');
const { db } = require('./config/database');

const app = express();

app.use(cors());
app.use(express.json());

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);

app.use('/api/auth', authRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/manual-sms', smsRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/inbox', inboxRoutes);
app.use('/api/numbers', numberRoutes);
app.use('/api/reports', reportRoutes);
app.use('/webhooks/vonage', webhookRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));